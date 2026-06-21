import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { LocalPartnersPanel } from './LocalPartnersPanel'
import { Heart, Zap } from 'lucide-react'
import { scoreColorCss, type LandListing, type RegionDeepDive } from '~/lib/mapClient'
import { PlotCarousel } from './PlotCarousel'
import { FactorScale } from './FactorScale'

// Master plan §2B — redesigned (ask #5): YC-grade research panel.
// Left: land-plot carousel (Browserbase images) with save-to-liked.
// Right: ASI buy/hold/avoid recommendation + 0–100 factor scale with drill-in.

interface Props {
  regionId: string | null
  regionLabel: string | null
  data: RegionDeepDive | null
  loading: boolean
  live: boolean
  onToggleLive: (v: boolean) => void
  likedIds: Set<string>
  onToggleLike: (listing: LandListing) => void
  likedCount: number
}

const VERDICT_META: Record<string, { label: string; cls: string }> = {
  buy: { label: 'BUY', cls: 'verdict--buy' },
  hold: { label: 'HOLD', cls: 'verdict--hold' },
  avoid: { label: 'AVOID', cls: 'verdict--avoid' },
}

export function DeepDiveResearchPanel({
  regionId,
  regionLabel,
  data,
  loading,
  live,
  onToggleLive,
  likedIds,
  onToggleLike,
  likedCount,
}: Props) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'listings' | 'partners'>('listings')
  const guide = data?.guide
  const verdict = guide ? VERDICT_META[guide.recommendation.verdict] ?? VERDICT_META.hold : null

  return (
    <section id="deep-dive-research-panel" className="deep-dive">
      <header className="deep-dive__header">
        <div>
          <div className="deep-dive__eyebrow">Deep-dive research</div>
          <h2 className="deep-dive__title">
            {regionLabel ? regionLabel : 'Select a district above'}
          </h2>
        </div>
        <div className="deep-dive__controls">
          <span className="deep-dive__liked-badge">
            <Heart size={14} fill="currentColor" /> {likedCount} saved
          </span>
          <label className="deep-dive__live-toggle">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => onToggleLive(e.target.checked)}
            />
            <span className="deep-dive__live-pill">
              <Zap size={12} /> {live ? 'Live' : 'Cached'}
            </span>
          </label>
        </div>
      </header>

      {!regionId && (
        <p className="deep-dive__empty">
          Pick a state, click a congressional district, then hit{' '}
          <strong>Explore This Area</strong> to pull land parcels and an
          AI-synthesized buy/sell analysis.
        </p>
      )}

      {regionId && (
        <>
          {/* Recommendation banner — the ASI in-depth buy/not-buy reasoning */}
          {guide && verdict && !loading && (
            <div className={`verdict-banner ${verdict.cls}`}>
              <div className="verdict-banner__badge">{verdict.label}</div>
              <div className="verdict-banner__body">
                <strong>{guide.recommendation.headline}</strong>
                <p>{guide.recommendation.reasoning}</p>
                <span className="verdict-banner__src">
                  Synthesized by ASI:One{data?.live ? ' · live' : ''} · via {guide.source}
                </span>
              </div>
              <div
                className="verdict-banner__score"
                style={{ borderColor: scoreColorCss(guide.consensusScore) }}
              >
                <span style={{ color: scoreColorCss(guide.consensusScore) }}>
                  {guide.consensusScore}
                </span>
                <small>consensus</small>
              </div>
            </div>
          )}

          <div className="deep-dive__grid">
            {/* LEFT — land plots carousel */}
            <div className="deep-dive__col">
              <div className="partner-tabs" role="tablist">
                <button
                  role="tab"
                  className={`partner-tab${activeTab === 'listings' ? ' partner-tab--active' : ''}`}
                  aria-selected={activeTab === 'listings'}
                  onClick={() => setActiveTab('listings')}
                >
                  Land &amp; Plots
                </button>
                <button
                  role="tab"
                  className={`partner-tab${activeTab === 'partners' ? ' partner-tab--active' : ''}`}
                  aria-selected={activeTab === 'partners'}
                  onClick={() => setActiveTab('partners')}
                >
                  Local Partners
                </button>
              </div>

              {activeTab === 'listings' ? (
                loading && !data ? (
                  <div className="carousel carousel--skeleton">
                    <div className="skeleton-card skeleton-card--lg" />
                    <p className="deep-dive__loading-text">Browserbase indexing parcels…</p>
                  </div>
                ) : (
                  <PlotCarousel
                    listings={data?.listings ?? []}
                    likedIds={likedIds}
                    onToggleLike={onToggleLike}
                  />
                )
              ) : (
                <LocalPartnersPanel regionId={regionId} live={live} />
              )}
            </div>

            {/* RIGHT — development likelihood factor scale */}
            <div className="deep-dive__col">
              <h3 className="deep-dive__col-title">Development Likelihood</h3>
              {loading && !data ? (
                <div className="deep-dive__spinner">
                  <div className="spinner" />
                  <p>ASI:One agents synthesizing the buy/sell analysis…</p>
                </div>
              ) : guide ? (
                <>
                  <FactorScale factors={guide.factors} />
                  <button
                    className="btn btn--primary insight-stack__cta"
                    onClick={() => {
                      try {
                        sessionStorage.setItem('Constructa:district', regionId)
                      } catch {
                        /* SSR / private mode */
                      }
                      navigate({ to: '/product' })
                    }}
                  >
                    Initiate Construction Build →
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </>
      )}
    </section>
  )
}