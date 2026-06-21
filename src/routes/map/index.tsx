import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { MapViewport } from '~/components/map/MapViewport'
import { DeepDiveResearchPanel } from '~/components/map/DeepDiveResearchPanel'
import {
  mapClient,
  type CongressRegion,
  type LandListing,
  type RegionDeepDive,
} from '~/lib/mapClient'

export const Route = createFileRoute('/map/')({
  component: MapPage,
})

// Page 2 — interactive choropleth + deep-dive workspace.
// State select → congressional regions + granular heatmap (§2A); region
// "Explore" → land carousel + factor-scored buy/sell analysis (§2B).
function MapPage() {
  const [activeRegion, setActiveRegion] = useState<CongressRegion | null>(null)
  const [result, setResult] = useState<RegionDeepDive | null>(null)
  const [loading, setLoading] = useState(false)
  const [live, setLive] = useState(false)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())

  // Hydrate liked plots from the Redis-backed store.
  useEffect(() => {
    mapClient
      .liked()
      .then((r) => setLikedIds(new Set(r.liked.map((l) => l.id))))
      .catch(() => {})
  }, [])

  const runDeepDive = useCallback(
    async (region: CongressRegion, liveMode: boolean) => {
      setActiveRegion(region)
      setResult(null)
      setLoading(true)
      requestAnimationFrame(() => {
        document
          .getElementById('deep-dive-research-panel')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      try {
        const data = await mapClient.regionDeepDive(region.id, { live: liveMode })
        setResult(data)
      } catch (err) {
        console.error('[map] region deep-dive failed', err)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const onExplore = useCallback(
    (region: CongressRegion) => runDeepDive(region, live),
    [runDeepDive, live],
  )

  const onToggleLive = useCallback(
    (v: boolean) => {
      setLive(v)
      if (activeRegion) runDeepDive(activeRegion, v)
    },
    [activeRegion, runDeepDive],
  )

  const onToggleLike = useCallback(
    (listing: LandListing) => {
      setLikedIds((prev) => {
        const next = new Set(prev)
        if (next.has(listing.id)) {
          next.delete(listing.id)
          mapClient.unlike(listing.id).catch(() => {})
        } else {
          next.add(listing.id)
          mapClient.like(listing).catch(() => {})
        }
        return next
      })
    },
    [],
  )

  return (
    <main className="map-page-v2">
      <div className="map-page-v2__stage">
        <MapViewport onExplore={onExplore} activeRegion={activeRegion?.id ?? null} />
      </div>
      <DeepDiveResearchPanel
        regionId={activeRegion?.id ?? null}
        regionLabel={activeRegion?.label ?? null}
        data={result}
        loading={loading}
        live={live}
        onToggleLive={onToggleLive}
        likedIds={likedIds}
        onToggleLike={onToggleLike}
        likedCount={likedIds.size}
      />
    </main>
  )
}
