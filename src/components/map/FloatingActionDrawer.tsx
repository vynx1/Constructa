import { scoreColorCss, type CongressRegion } from '~/lib/mapClient'

// Master plan §2A — floating action drawer at STATE level, scoped to a selected
// congressional region. Shows the region consensus score + zips and the CTA
// that triggers the async deep-dive + smooth-scroll to the research panel.

interface Props {
  region: CongressRegion
  isExploring: boolean
  onExplore: () => void
}

export function FloatingActionDrawer({ region, isExploring, onExplore }: Props) {
  const score = region.score
  return (
    <div className="action-drawer">
      <div className="action-drawer__head">
        <div>
          <div className="action-drawer__eyebrow">
            Congressional district {region.number ?? region.index + 1} · {region.city}
          </div>
          <h3 className="action-drawer__title">{region.label}</h3>
        </div>
        <div
          className="action-drawer__score"
          style={{ borderColor: scoreColorCss(score) }}
        >
          <span style={{ color: scoreColorCss(score) }}>{score}</span>
          <small>consensus</small>
        </div>
      </div>

      <dl className="action-drawer__metrics">
        <div>
          <dt>Zip codes</dt>
          <dd>{region.zips.slice(0, 4).join(', ')}</dd>
        </div>
      </dl>

      <button
        className="btn btn--primary action-drawer__cta"
        onClick={onExplore}
        disabled={isExploring}
      >
        {isExploring ? 'Researching…' : 'Explore This Area / Find Land'}
      </button>
    </div>
  )
}
