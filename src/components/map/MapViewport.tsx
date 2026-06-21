import { useEffect, useMemo, useRef, useState } from 'react'
import { DeckGL } from '@deck.gl/react'
import { GeoJsonLayer, PolygonLayer } from '@deck.gl/layers'
import {
  FlyToInterpolator,
  WebMercatorViewport,
  type MapViewState,
} from '@deck.gl/core'
import {
  mapClient,
  scoreColor,
  scoreColorCss,
  type CongressRegion,
  type HeatCell,
  type StateScore,
} from '~/lib/mapClient'
import { pointInGeometry, geometryBBox, clipGeometryToStrip } from '~/lib/geo'
import { FloatingActionDrawer } from './FloatingActionDrawer'

// ---------------------------------------------------------------------------
// MapViewport — master plan §2A, revised per ask #3.
//
// NATIONAL: US states shaded by construction-consensus score.
// Clicking a state does NOT zoom to a hyper-specific point — it fits the whole
// state in view, draws its CONGRESSIONAL REGION dividing lines, paints a dense
// zip-level heatmap clipped to the state's real outline, and lets the user
// SELECT a region. Selecting a region surfaces the "Explore This Area" CTA.
// ---------------------------------------------------------------------------

type ZoomLevel = 'NATIONAL' | 'STATE'

const NATIONAL_VIEW: MapViewState = {
  longitude: -98,
  latitude: 39,
  zoom: 3.4,
  pitch: 0,
  bearing: 0,
}

const US_STATES_GEOJSON =
  'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'

// Smallest positive gap between sorted unique values → the grid step.
function gridStep(values: number[]): number {
  const uniq = [...new Set(values)].sort((a, b) => a - b)
  let min = Infinity
  for (let i = 1; i < uniq.length; i++) {
    const d = uniq[i]! - uniq[i - 1]!
    if (d > 1e-9 && d < min) min = d
  }
  return Number.isFinite(min) ? min : 0.1
}

interface Props {
  onExplore: (region: CongressRegion) => void
  activeRegion: string | null
}

export function MapViewport({ onExplore, activeRegion }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('NATIONAL')
  const [viewState, setViewState] = useState<MapViewState>(NATIONAL_VIEW)
  const [statesGeo, setStatesGeo] = useState<any>(null)
  const [scores, setScores] = useState<Record<string, StateScore>>({})
  const [selectedState, setSelectedState] = useState<string | null>(null)
  const [selectedFeature, setSelectedFeature] = useState<any>(null)
  const [regions, setRegions] = useState<CongressRegion[]>([])
  const [cells, setCells] = useState<HeatCell[]>([])
  const [selectedRegion, setSelectedRegion] = useState<CongressRegion | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const stateNameToCode = useRef<Record<string, string>>({})

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!mounted) return
    let cancelled = false
    ;(async () => {
      try {
        const [scoreRes, geoRes] = await Promise.all([
          mapClient.states(),
          fetch(US_STATES_GEOJSON).then((r) => r.json()),
        ])
        if (cancelled) return
        const byCode: Record<string, StateScore> = {}
        const byName: Record<string, string> = {}
        for (const s of scoreRes.states) {
          byCode[s.code] = s
          byName[s.name.toLowerCase()] = s.code
        }
        setScores(byCode)
        stateNameToCode.current = byName
        setStatesGeo(geoRes)
      } catch (err) {
        console.error('[map] failed to load states/geometry', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mounted])

  const scoreForFeature = (feature: any): number | null => {
    const name: string = feature?.properties?.name ?? ''
    const code = stateNameToCode.current[name.toLowerCase()]
    if (!code) return null
    return scores[code]?.aggregateScore ?? null
  }

  // Compute a viewState that fits a geometry's bounds in the current container.
  const fitToGeometry = (geometry: any): MapViewState => {
    const [minLng, minLat, maxLng, maxLat] = geometryBBox(geometry)
    const w = containerRef.current?.clientWidth ?? 900
    const h = containerRef.current?.clientHeight ?? 600
    try {
      const vp = new WebMercatorViewport({ width: w, height: h })
      const { longitude, latitude, zoom } = vp.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 60 },
      )
      return {
        longitude,
        latitude,
        zoom: Math.min(zoom, 8),
        transitionDuration: 1100,
        transitionInterpolator: new FlyToInterpolator(),
      } as MapViewState
    } catch {
      return {
        longitude: (minLng + maxLng) / 2,
        latitude: (minLat + maxLat) / 2,
        zoom: 5,
      } as MapViewState
    }
  }

  // Drill into a clicked state — fit bounds + load regions + heatmap.
  const enterState = async (feature: any) => {
    const name: string = feature?.properties?.name ?? ''
    const code = stateNameToCode.current[name.toLowerCase()]
    if (!code) return
    setSelectedState(code)
    setSelectedFeature(feature)
    setSelectedRegion(null)
    setZoomLevel('STATE')
    setViewState(fitToGeometry(feature.geometry))
    try {
      const [regionRes, heatRes] = await Promise.all([
        mapClient.regions(code),
        mapClient.heatmap(code),
      ])
      setRegions(regionRes.regions)
      // Clip dense cells to the state's real outline so the heatmap hugs it.
      const clipped = heatRes.cells.filter((cell) =>
        pointInGeometry(cell.coordinates, feature.geometry),
      )
      setCells(clipped)
    } catch (err) {
      console.error('[map] state drill failed', err)
    }
  }

  const backToNational = () => {
    setZoomLevel('NATIONAL')
    setSelectedState(null)
    setSelectedFeature(null)
    setSelectedRegion(null)
    setRegions([])
    setCells([])
    setViewState({
      ...NATIONAL_VIEW,
      transitionDuration: 900,
      transitionInterpolator: new FlyToInterpolator(),
    } as MapViewState)
  }

  // Build congressional-region polygons by clipping the state to each strip.
  const regionFC = useMemo(() => {
    if (!selectedFeature || !regions.length) return null
    const features = regions
      .map((r) => {
        const geometry = clipGeometryToStrip(selectedFeature.geometry, r.xMin, r.xMax)
        if (!geometry.coordinates.length) return null
        return {
          type: 'Feature',
          properties: { id: r.id, label: r.label, score: r.score, index: r.index },
          geometry,
        }
      })
      .filter(Boolean)
    return { type: 'FeatureCollection', features }
  }, [selectedFeature, regions])

  const layers = useMemo(() => {
    const out: any[] = []
    if (statesGeo) {
      out.push(
        new GeoJsonLayer({
          id: 'us-states',
          data: statesGeo,
          stroked: true,
          filled: true,
          pickable: zoomLevel === 'NATIONAL',
          autoHighlight: zoomLevel === 'NATIONAL',
          highlightColor: [200, 85, 61, 90],
          getLineColor:
            zoomLevel === 'NATIONAL' ? [226, 221, 212, 255] : [210, 205, 196, 120],
          lineWidthMinPixels: zoomLevel === 'NATIONAL' ? 1 : 0.5,
          getFillColor: (f: any) => {
            const isSel =
              selectedState &&
              stateNameToCode.current[(f.properties?.name ?? '').toLowerCase()] ===
                selectedState
            if (zoomLevel === 'STATE')
              return isSel ? [0, 0, 0, 0] : [235, 232, 225, 90] // dim others
            const score = scoreForFeature(f)
            if (score == null) return [235, 232, 225, 120]
            const [r, g, b] = scoreColor(score)
            return [r, g, b, 175]
          },
          updateTriggers: { getFillColor: [scores, selectedState, zoomLevel] },
          onHover: (info: any) =>
            zoomLevel === 'NATIONAL' &&
            setHovered(info.object?.properties?.name ?? null),
          onClick: (info: any) =>
            zoomLevel === 'NATIONAL' && info.object && enterState(info.object),
        }),
      )
    }

    if (zoomLevel === 'STATE' && cells.length) {
      // Seamless tiles (no gap) over a dense grid → reads as a smooth field.
      const dLng = gridStep(cells.map((c) => c.coordinates[0]))
      const dLat = gridStep(cells.map((c) => c.coordinates[1]))
      const hx = dLng * 0.5
      const hy = dLat * 0.5

      // Per-state CONTRAST STRETCH: normalize each cell against this state's own
      // mean/spread and amplify, so small score differences become big color
      // differences and the whole red→green ramp is used (ask #4).
      const ss = cells.map((c) => c.score)
      const mean = ss.reduce((a, b) => a + b, 0) / ss.length
      const sd =
        Math.sqrt(ss.reduce((a, b) => a + (b - mean) ** 2, 0) / ss.length) || 1
      const GAIN = 26 // higher = more extreme color separation
      const stretch = (s: number) =>
        Math.max(2, Math.min(98, 50 + ((s - mean) / sd) * GAIN))

      out.push(
        new PolygonLayer({
          id: 'state-heat-cells',
          data: cells,
          getPolygon: (d: HeatCell) => {
            const [x, y] = d.coordinates
            return [
              [x - hx, y - hy],
              [x + hx, y - hy],
              [x + hx, y + hy],
              [x - hx, y + hy],
            ]
          },
          getFillColor: (d: HeatCell) => {
            const [r, g, b] = scoreColor(stretch(d.score))
            return [r, g, b, 230]
          },
          stroked: false,
          filled: true,
          pickable: false,
          updateTriggers: { getFillColor: [cells] },
        }),
      )
    }

    if (zoomLevel === 'STATE' && regionFC) {
      out.push(
        new GeoJsonLayer({
          id: 'congress-regions',
          data: regionFC as any,
          stroked: true,
          filled: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [26, 25, 22, 60],
          getLineColor: (f: any) =>
            selectedRegion?.id === f.properties.id
              ? [26, 25, 22, 255]
              : [26, 25, 22, 150],
          getLineWidth: (f: any) => (selectedRegion?.id === f.properties.id ? 3 : 1.4),
          lineWidthUnits: 'pixels',
          getFillColor: (f: any) =>
            selectedRegion?.id === f.properties.id ? [200, 85, 61, 45] : [0, 0, 0, 0],
          updateTriggers: {
            getLineColor: [selectedRegion],
            getLineWidth: [selectedRegion],
            getFillColor: [selectedRegion],
          },
          onClick: (info: any) => {
            const id = info.object?.properties?.id
            const r = regions.find((x) => x.id === id)
            if (r) setSelectedRegion(r)
          },
          onHover: (info: any) => setHovered(info.object?.properties?.label ?? null),
        }),
      )
    }
    return out
  }, [statesGeo, scores, zoomLevel, cells, regionFC, selectedRegion, selectedState, regions])

  if (!mounted) return <div className="map-canvas map-canvas--loading" />

  return (
    <div className="map-viewport" ref={containerRef}>
      <DeckGL
        viewState={viewState as any}
        onViewStateChange={(e: any) => setViewState(e.viewState)}
        controller={true}
        layers={layers}
        style={{ position: 'absolute', inset: '0' }}
        getTooltip={({ object }: any) => {
          if (zoomLevel === 'NATIONAL' && object?.properties?.name)
            return {
              text: `${object.properties.name} — score ${scoreForFeature(object) ?? 'n/a'}`,
            }
          if (zoomLevel === 'STATE' && object?.properties?.label)
            return { text: `${object.properties.label} — consensus ${object.properties.score}` }
          return null
        }}
      />

      <div className="map-breadcrumb">
        <button
          className="map-breadcrumb__crumb"
          onClick={backToNational}
          disabled={zoomLevel === 'NATIONAL'}
        >
          United States
        </button>
        {selectedState && (
          <>
            <span className="map-breadcrumb__sep">/</span>
            <span className="map-breadcrumb__crumb map-breadcrumb__crumb--active">
              {scores[selectedState]?.name ?? selectedState}
            </span>
          </>
        )}
        {selectedRegion && (
          <>
            <span className="map-breadcrumb__sep">/</span>
            <span className="map-breadcrumb__crumb map-breadcrumb__crumb--active">
              District {selectedRegion.index + 1}
            </span>
          </>
        )}
      </div>

      {zoomLevel === 'NATIONAL' && hovered && (
        <div className="map-hover-hint">Hovering {hovered} · click to open state</div>
      )}

      {zoomLevel === 'STATE' && (
        <div className="map-region-help">
          {selectedRegion
            ? `${selectedRegion.label} selected — hit Explore to pull land + analysis`
            : 'Click a congressional district to select its granular heatmap'}
        </div>
      )}

      {zoomLevel === 'STATE' && (
        <div className="heat-legend">
          <span className="heat-legend__title">Land suitability (within state)</span>
          <div
            className="heat-legend__bar"
            style={{
              background: `linear-gradient(90deg, ${[0, 25, 42, 50, 58, 75, 100]
                .map((s) => scoreColorCss(s))
                .join(', ')})`,
            }}
          />
          <div className="heat-legend__ticks">
            <span>Lower</span>
            <span>Higher</span>
          </div>
        </div>
      )}

      {zoomLevel === 'STATE' && selectedRegion && (
        <FloatingActionDrawer
          region={selectedRegion}
          isExploring={activeRegion === selectedRegion.id}
          onExplore={() => onExplore(selectedRegion)}
        />
      )}
    </div>
  )
}
