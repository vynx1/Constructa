import type { ReactNode } from 'react'

export function MapIntelFrame({ children }: { children: ReactNode }) {
  return (
    <div className="map-intel">
      {/* Midjourney slot: map-teaser heat-map backdrop — see MIDJOURNEY prompt #2 */}
      <div className="mj-slot mj-slot--map-backdrop" aria-hidden />
      <span className="map-intel__reticle map-intel__reticle--tl" aria-hidden />
      <span className="map-intel__reticle map-intel__reticle--tr" aria-hidden />
      <span className="map-intel__reticle map-intel__reticle--bl" aria-hidden />
      <span className="map-intel__reticle map-intel__reticle--br" aria-hidden />
      <div className="map-intel__chrome">
        <span className="map-intel__live">
          <span className="map-intel__live-dot" aria-hidden />
          LIVE INTEL
        </span>
        <span className="map-intel__scale font-mono">SCALE 1:2.4M · NAD83</span>
      </div>
      <div className="map-intel__viewport">{children}</div>
    </div>
  )
}
