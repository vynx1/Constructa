import { Cpu, ShieldCheck, ShieldAlert, MapPin } from 'lucide-react'
import { scoreColorCss } from '~/lib/mapScores'
import { PlotCarousel } from '~/components/map/PlotCarousel'
import type { CachedDeepDive } from '~/lib/projectClient'

// Right side of the intake phase (spec): "learn more about the property".
// The 6 cards = the paragraph-long consensus + reasoning dive-deeper analysis of
// the PREVIOUS property, reusing the six Agentverse-specialist factors that were
// already computed on the map. The previous carousel is shown below, cached from
// the deep-dive the map forwarded — nothing is re-fetched here.

const VERDICT_META: Record<string, { label: string; cls: string }> = {
  buy: { label: 'BUY', cls: 'verdict--buy' },
  hold: { label: 'HOLD', cls: 'verdict--hold' },
  avoid: { label: 'AVOID', cls: 'verdict--avoid' },
}
const DEFAULT_VERDICT = { label: 'HOLD', cls: 'verdict--hold' }

function confidenceLabel(c?: number) {
  if (c == null) return { text: 'unrated', good: false }
  if (c >= 0.75) return { text: `high · ${Math.round(c * 100)}%`, good: true }
  if (c >= 0.4) return { text: `medium · ${Math.round(c * 100)}%`, good: true }
  return { text: `low · ${Math.round(c * 100)}%`, good: false }
}

// A long-form, in-the-agent's-voice explanation of why this factor makes the
// land good or bad to build on — shown on hover (#1). Leads with the specialist
// agent's own reasoning, then frames the score, confidence, and buy implication.
function buildExplanation(
  f: { label: string; score: number; reasoning: string; confidence?: number; agent?: { name: string } },
  regionLabel: string,
): string {
  const agent = f.agent?.name ?? 'The specialist agent'
  const verdict =
    f.score >= 72
      ? `a clear reason to build here`
      : f.score >= 50
      ? `a real but manageable consideration`
      : `a meaningful constraint on building here`
  const conf =
    f.confidence == null
      ? ''
      : f.confidence >= 0.75
      ? ` It holds this view with high confidence, so it should weigh heavily in the decision.`
      : f.confidence >= 0.4
      ? ` It is moderately confident, so treat this as directional rather than final.`
      : ` Its confidence here is low, so this factor warrants independent verification before you commit.`
  const close =
    f.score >= 72
      ? `On balance this pushes ${regionLabel} toward a buy on the "${f.label}" dimension.`
      : f.score >= 50
      ? `On balance this neither makes nor breaks ${regionLabel}, but it does shape how you'd budget and sequence the work.`
      : `On balance this drags ${regionLabel} toward caution on the "${f.label}" dimension and should be priced into the deal.`
  return `${agent} evaluated "${f.label}" for ${regionLabel} and scored it ${f.score}/100 — ${verdict}. ${f.reasoning}${conf} ${close}`
}

export function PropertyInsightCards({ cached }: { cached: CachedDeepDive | null }) {
  if (!cached) {
    return (
      <aside className="property-insight property-insight--empty">
        <div className="property-insight__eyebrow">Learn more about the property</div>
        <p className="property-insight__empty-text">
          Open a district on the <strong>Map</strong> and hit <em>Initiate Construction
          Build</em> to carry its full analysis here — the six-agent consensus and the land
          parcels travel with you.
        </p>
      </aside>
    )
  }

  const { regionLabel, deepDive } = cached
  const guide = deepDive.guide
  const verdict = VERDICT_META[guide.recommendation.verdict] ?? DEFAULT_VERDICT
  const factors = guide.factors.slice(0, 6)

  return (
    <aside className="property-insight">
      <header className="property-insight__header">
        <div>
          <div className="property-insight__eyebrow">Learn more about the property</div>
          <h3 className="property-insight__title">
            <MapPin size={15} /> {regionLabel}
          </h3>
        </div>
        <div
          className="property-insight__score"
          style={{ borderColor: scoreColorCss(guide.consensusScore) }}
        >
          <span style={{ color: scoreColorCss(guide.consensusScore) }}>
            {guide.consensusScore}
          </span>
          <small>In-depth score</small>
        </div>
      </header>

      <div className={`property-insight__verdict ${verdict.cls}`}>
        <span className="property-insight__verdict-badge">{verdict.label}</span>
        <p>{guide.recommendation.reasoning}</p>
      </div>

      {/* The 6 cards — one per Agentverse specialist factor. */}
      <div className="insight-cards">
        {factors.map((f) => {
          const conf = confidenceLabel(f.confidence)
          const Icon = conf.good ? ShieldCheck : ShieldAlert
          return (
            <article key={f.key} className="insight-card" tabIndex={0}>
              <div className="insight-card__top">
                <span className="insight-card__label">{f.label}</span>
                <span
                  className="insight-card__score"
                  style={{ color: scoreColorCss(f.score) }}
                >
                  {f.score}
                </span>
              </div>
              <div className="insight-card__track">
                <div
                  className="insight-card__fill"
                  style={{ width: `${f.score}%`, background: scoreColorCss(f.score) }}
                />
              </div>
              <p className="insight-card__reasoning">{f.reasoning}</p>
              {f.agent && (
                <div className="insight-card__agent">
                  <Cpu size={11} />
                  <span>{f.agent.name}</span>
                  <span className={`insight-card__conf ${conf.good ? 'is-good' : 'is-weak'}`}>
                    <Icon size={11} /> {conf.text}
                  </span>
                </div>
              )}

              {/* Hover/focus → long agent explanation of why the land is good/bad. */}
              <div className="insight-card__explain" role="tooltip">
                <div className="insight-card__explain-head">
                  <Cpu size={12} />
                  <span>{f.agent?.name ?? 'Specialist agent'}</span>
                  <span
                    className="insight-card__explain-score"
                    style={{ color: scoreColorCss(f.score) }}
                  >
                    {f.score}/100
                  </span>
                </div>
                <p className="insight-card__explain-body">
                  {buildExplanation(f, regionLabel)}
                </p>
                {f.sources && f.sources.length > 0 && (
                  <div className="insight-card__explain-sources">
                    {f.sources.slice(0, 3).map((s) => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                        {s.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {/* The previous carousel, cached forward from the map deep-dive. */}
      <div className="property-insight__parcels">
        <div className="property-insight__parcels-title">
          Parcels carried from this district
        </div>
        <PlotCarousel
          listings={deepDive.listings ?? []}
          likedIds={new Set()}
          onToggleLike={() => {}}
        />
      </div>
    </aside>
  )
}
