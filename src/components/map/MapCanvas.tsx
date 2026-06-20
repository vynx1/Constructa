import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { Deck } from '@deck.gl/core'
import 'maplibre-gl/dist/maplibre-gl.css'

interface Props {
  dataCenterMode: boolean
  activeLayer: string
}

// Page 2 map: MapLibre GL vector basemap (no token) + a deck.gl overlay.
// Client-only. This wires the rendering pipeline; data layers
// (HeatmapLayer / GeoJsonLayer) are added against /api/map/* in the map pass.
export function MapCanvas({ dataCenterMode, activeLayer }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!mounted || !containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      // Free demo style; swap for a self-hosted style in production.
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-119.4, 36.7], // California
      zoom: 5,
    })

    // deck.gl overlay synced to the MapLibre camera.
    const deck = new Deck({
      initialViewState: { longitude: -119.4, latitude: 36.7, zoom: 5 },
      controller: false,
      parent: containerRef.current,
      style: { position: 'absolute', inset: '0', zIndex: '1' },
      layers: [],
    })

    map.on('move', () => {
      const { lng, lat } = map.getCenter()
      deck.setProps({
        viewState: {
          longitude: lng,
          latitude: lat,
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
        },
      })
    })

    return () => {
      deck.finalize()
      map.remove()
    }
  }, [mounted])

  // dataCenterMode / activeLayer drive which deck.gl layers render — wired in
  // the map build-out; referenced here to keep the contract explicit.
  void dataCenterMode
  void activeLayer

  return <div ref={containerRef} className="map-canvas" />
}
