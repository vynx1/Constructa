import { useState } from 'react'
import { X, ExternalLink, Info, Cpu, ShieldCheck, ShieldAlert } from 'lucide-react'
import { scoreColorCss, type GuideFactor } from '~/lib/mapClient'

// Ask #5 — "Development Likelihood" as a ranked 0–100 factor scale. Each factor
// is now traced back to the specific Agentverse specialist agent that produced
// it (multistack flow: 6 uAgents -> ASI:One consensus). Clicking a row opens an
// in-depth panel explaining HOW the score was derived, which agent answered,
// its confidence, and the Browserbase-grabbed sources behind it.

interface Props {
  factors: GuideFactor[]
}

function confidenceLabel(c?: number) {
  if (c == null) return { text: 'unrated', cls: 'conf--unknown' }
  if (c >= 0.75) return { text: `high · ${Math.round(c * 100)}%`, cls: 'conf--high' }
  if (c >= 0.4) return { text: `medium · ${Math.round(c * 100)}%`, cls: 'conf--med' }
  return { text: `low · ${Math.round(c * 100)}%`, cls: 'conf--low' }
}

export function FactorScale({ factors }: Props) {
  const [open, setOpen] = useState<GuideFactor | null>(null)

  return (
    <div className="factor-scale">
      <div className="factor-scale__legend">
        <Cpu size={12} /> Each factor is computed by a dedicated Agentverse agent,
        then fused by ASI:One into the in-depth score.
      </div>

      {factors.map((f) => {
        const conf = confidenceLabel(f.confidence)
        return (
          <button
            key={f.key}
            className="factor-row"
            onClick={() => setOpen(f)}
            title="Click to see which agent produced this score + its reasoning"
          >
            <div className="factor-row__head">
              <span className="factor-row__label">{f.label}</span>
              <span
                className="factor-row__score"
                style={{ color: scoreColorCss(f.score) }}
              >
                {f.score}
                <Info size={12} className="factor-row__info" />
              </span>
            </div>
            <div className="factor-row__track">
              <div
                className="factor-row__fill"
                style={{
                  width: `${f.score}%`,
                  background: `linear-gradient(90deg, ${scoreColorCss(
                    Math.max(10, f.score - 25),
                  )}, ${scoreColorCss(f.score)})`,
                }}
              />
              <div className="factor-row__ticks">
                {[25, 50, 75].map((t) => (
                  <span key={t} style={{ left: `${t}%` }} />
                ))}
              </div>
            </div>
            {f.agent && (
              <div className="factor-row__agent">
                <Cpu size={11} />
                <span className="factor-row__agent-name">{f.agent.name}</span>
                <span className={`factor-row__conf ${conf.cls}`}>{conf.text}</span>
              </div>
            )}
          </button>
        )
      })}

      {open && (
        <div className="factor-modal" onClick={() => setOpen(null)}>
          <div className="factor-modal__card" onClick={(e) => e.stopPropagation()}>
            <button className="factor-modal__close" onClick={() => setOpen(null)}>
              <X size={18} />
            </button>
            <div className="factor-modal__score" style={{ color: scoreColorCss(open.score) }}>
              {open.score}
              <small>/100</small>
            </div>
            <h4 className="factor-modal__title">{open.label}</h4>
            <div className="factor-modal__bar">
              <div
                style={{
                  width: `${open.score}%`,
                  background: scoreColorCss(open.score),
                }}
              />
            </div>

            {open.agent && (
              <div className="factor-modal__agent">
                <div className="factor-modal__agent-head">
                  <Cpu size={14} />
                  <span>Computed by <strong>{open.agent.name}</strong> on Agentverse</span>
                  {(() => {
                    const c = confidenceLabel(open.confidence)
                    const Icon = (open.confidence ?? 0) >= 0.4 ? ShieldCheck : ShieldAlert
                    return (
                      <span className={`factor-modal__conf ${c.cls}`}>
                        <Icon size={12} /> {c.text}
                      </span>
                    )
                  })()}
                </div>
                <code className="factor-modal__agent-addr">{open.agent.handle}</code>
                <p className="factor-modal__agent-flow">
                  This indicator was requested from the specialist agent via the
                  ASI:One router. Its verdict (with the confidence above) is one of
                  six signals weighted into the overall consensus "buy / hold /
                  avoid" recommendation. Low-confidence answers are automatically
                  re-queried before being accepted.
                </p>
              </div>
            )}

            <p className="factor-modal__reasoning">{open.reasoning}</p>
            {open.sources.length > 0 && (
              <div className="factor-modal__sources">
                <span className="factor-modal__sources-title">
                  Evidence the agent cited (via Browserbase)
                </span>
                {open.sources.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                    <ExternalLink size={12} /> {s.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}