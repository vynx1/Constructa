import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { MapCanvas } from '~/components/map/MapCanvas'
import { LayerSwitcher } from '~/components/map/LayerSwitcher'
import { DataCenterToggle } from '~/components/map/DataCenterToggle'

export const Route = createFileRoute('/map/')({
  component: MapPage,
})

// Page 2 — National map (levels 1 & 2 + data-center mode).
// All reads are cache-backed (`/api/map/*`); no live external calls.
function MapPage() {
  const [dataCenterMode, setDataCenterMode] = useState(false)
  const [activeLayer, setActiveLayer] = useState('pressure')

  return (
    <main className="map-page">
      <div className="map-page__canvas">
        <MapCanvas dataCenterMode={dataCenterMode} activeLayer={activeLayer} />
      </div>
      <aside className="map-page__panel">
        <h2>Land intelligence</h2>
        <DataCenterToggle value={dataCenterMode} onChange={setDataCenterMode} />
        <LayerSwitcher
          value={activeLayer}
          onChange={setActiveLayer}
          dataCenterMode={dataCenterMode}
        />
      </aside>
    </main>
  )
}
