import { useEffect, useMemo, useRef, useState } from 'react'
import { DeckGL } from '@deck.gl/react'
import { GeoJsonLayer } from '@deck.gl/layers'
import {
  FlyToInterpolator,
  WebMercatorViewport,
  type MapViewState,
} from '@deck.gl/core'
import {
  mapClient,
  colorForScore,
  districtQuickScore,
  type CongressRegion,
  type StateScore,
} from '~/lib/mapClient'
import { geometryBBox } from '~/lib/geo'
import { FloatingActionDrawer } from './FloatingActionDrawer'
import { ColorScaleLegend } from './ColorScaleLegend'

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
  const [districtGeo, setDistrictGeo] = useState<any>(null)
  const [countyGeo, setCountyGeo] = useState<any>(null)
  const [districts, setDistricts] = useState<CongressRegion[]>([])
  const [selectedDistrict, setSelectedDistrict] = useState<CongressRegion | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [loadingState, setLoadingState] = useState(false)
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

  const nationalScores = useMemo(
    () => Object.values(scores).map((s) => s.aggregateScore),
    [scores],
  )

  const districtScores = useMemo(
    () => districts.map((d) => d.score),
    [districts],
  )

  const scorePopulation =
    zoomLevel === 'NATIONAL' ? nationalScores : districtScores

  const scoreExtentView = useMemo(() => {
    const vals = scorePopulation.length ? scorePopulation : [0, 100]
    return { min: Math.min(...vals), max: Math.max(...vals) }
  }, [scorePopulation])

  const scoreForFeature = (feature: any): number | null => {
    const name: string = feature?.properties?.name ?? ''
    const code = stateNameToCode.current[name.toLowerCase()]
    if (!code) return null
    return scores[code]?.aggregateScore ?? null
  }

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

  const enterState = async (feature: any) => {
    const name: string = feature?.properties?.name ?? ''
    const code = stateNameToCode.current[name.toLowerCase()]
    if (!code) return
    setSelectedState(code)
    setSelectedFeature(feature)
    setSelectedDistrict(null)
    setZoomLevel('STATE')
    setViewState(fitToGeometry(feature.geometry))
    setLoadingState(true)
    try {
      const [cdRes, countyRes] = await Promise.all([
        mapClient.congressionalDistricts(code),
        mapClient.counties(code),
      ])
      setDistricts(cdRes.districts)
      setDistrictGeo(cdRes.geojson)
      setCountyGeo(countyRes.geojson)
    } catch (err) {
      console.error('[map] state drill failed', err)
      setDistricts([])
      setDistrictGeo(null)
      setCountyGeo(null)
    } finally {
      setLoadingState(false)
    }
  }

  const backToNational = () => {
    setZoomLevel('NATIONAL')
    setSelectedState(null)
    setSelectedFeature(null)
    setSelectedDistrict(null)
    setDistricts([])
    setDistrictGeo(null)
    setCountyGeo(null)
    setViewState({
      ...NATIONAL_VIEW,
      transitionDuration: 900,
      transitionInterpolator: new FlyToInterpolator(),
    } as MapViewState)
  }

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
          highlightColor: [200, 133, 61, 120],
          getLineColor:
            zoomLevel === 'NATIONAL'
              ? [34, 211, 238, 60]
              : [255, 255, 255, 40],
          lineWidthMinPixels: zoomLevel === 'NATIONAL' ? 1 : 0.5,
          getFillColor: (f: any) => {
            const isSel =
              selectedState &&
              stateNameToCode.current[(f.properties?.name ?? '').toLowerCase()] ===
                selectedState
            if (zoomLevel === 'STATE')
              return isSel ? [0, 0, 0, 0] : [18, 22, 30, 140]
            const score = scoreForFeature(f)
            if (score == null) return [30, 36, 48, 160]
            const [r, g, b] = colorForScore(score, nationalScores)
            return [r, g, b, 210]
          },
          updateTriggers: {
            getFillColor: [scores, selectedState, zoomLevel, nationalScores.length],
          },
          onHover: (info: any) =>
            zoomLevel === 'NATIONAL' &&
            setHovered(info.object?.properties?.name ?? null),
          onClick: (info: any) =>
            zoomLevel === 'NATIONAL' && info.object && enterState(info.object),
        }),
      )
    }

    if (zoomLevel === 'STATE' && countyGeo?.features?.length) {
      out.push(
        new GeoJsonLayer({
          id: 'county-lines',
          data: countyGeo,
          stroked: true,
          filled: false,
          pickable: false,
          getLineColor: [255, 255, 255, 55],
          lineWidthMinPixels: 0.6,
          lineWidthMaxPixels: 1.2,
        }),
      )
    }

    if (zoomLevel === 'STATE' && districtGeo?.features?.length) {
      out.push(
        new GeoJsonLayer({
          id: 'congressional-districts',
          data: districtGeo,
          stroked: true,
          filled: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [251, 191, 36, 80],
          getLineColor: (f: any) => {
            const sel = selectedDistrict?.id === f.properties?.id
            return sel ? [251, 191, 36, 255] : [255, 255, 255, 100]
          },
          getLineWidth: (f: any) =>
            selectedDistrict?.id === f.properties?.id ? 2.5 : 1,
          lineWidthUnits: 'pixels',
          getFillColor: (f: any) => {
            const score = f.properties?.score ?? 50
            const [r, g, b] = colorForScore(score, districtScores)
            const sel = selectedDistrict?.id === f.properties?.id
            return [r, g, b, sel ? 240 : 215]
          },
          updateTriggers: {
            getFillColor: [districtScores.join(','), selectedDistrict?.id],
            getLineColor: [selectedDistrict?.id],
            getLineWidth: [selectedDistrict?.id],
          },
          onClick: (info: any) => {
            const id = info.object?.properties?.id
            const d = districts.find((x) => x.id === id)
            if (d) setSelectedDistrict(d)
          },
          onHover: (info: any) =>
            setHovered(info.object?.properties?.label ?? null),
        }),
      )
    }

    return out
  }, [
    statesGeo,
    scores,
    zoomLevel,
    districtGeo,
    countyGeo,
    selectedDistrict,
    selectedState,
    districts,
    nationalScores,
    districtScores,
  ])

  if (!mounted) {
    return <div className="map-canvas map-canvas--loading map-canvas--dark" />
  }

  const districtLabel = selectedDistrict
    ? selectedDistrict.label.split('·').pop()?.trim() ?? selectedDistrict.label
    : null

  return (
    <div className="map-viewport map-viewport--dark" ref={containerRef}>
      <div className="map-viewport__grid" aria-hidden />
      <DeckGL
        viewState={viewState as any}
        onViewStateChange={(e: any) => setViewState(e.viewState)}
        controller={true}
        layers={layers}
        style={{ position: 'absolute', inset: '0' }}
        getTooltip={({ object }: any) => {
          if (zoomLevel === 'NATIONAL' && object?.properties?.name) {
            const score = scoreForFeature(object)
            return {
              text: `${object.properties.name} — score ${score == null ? 'n/a' : score}`,
            }
          }
          if (zoomLevel === 'STATE' && object?.properties?.label) {
            return {
              text: `${object.properties.label} — Quick-Score ${object.properties.score}`,
            }
          }
          return null
        }}
      />

      <div className="map-breadcrumb map-breadcrumb--dark">
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
        {districtLabel && (
          <>
            <span className="map-breadcrumb__sep">/</span>
            <span className="map-breadcrumb__crumb map-breadcrumb__crumb--active">
              {districtLabel}
            </span>
          </>
        )}
      </div>

      <ColorScaleLegend
        extent={scoreExtentView}
        mode={zoomLevel === 'NATIONAL' ? 'national' : 'state'}
      />

      {zoomLevel === 'NATIONAL' && hovered && (
        <div className="map-hover-hint map-hover-hint--dark">
          {hovered} · click to explore districts
        </div>
      )}

      {zoomLevel === 'STATE' && !loadingState && (
        <div className="map-region-help map-region-help--dark">
          {selectedDistrict
            ? `${selectedDistrict.label} — Quick-Score ${districtQuickScore(selectedDistrict)} · Explore for in-depth analysis`
            : 'Click a congressional district to see its Quick-Score'}
        </div>
      )}

      {loadingState && (
        <div className="map-region-help map-region-help--dark map-region-help--loading">
          Loading congressional districts…
        </div>
      )}

      {zoomLevel === 'STATE' && selectedDistrict && (
        <FloatingActionDrawer
          region={selectedDistrict}
          isExploring={activeRegion === selectedDistrict.id}
          onExplore={() => onExplore(selectedDistrict)}
        />
      )}
    </div>
  )
}
