import { useState } from 'react'
import { X, ExternalLink, Info } from 'lucide-react'
import { scoreColorCss, type GuideFactor } from '~/lib/mapClient'

// Ask #5 — "Development Likelihood" as a ranked 0–100 factor scale (Unusual
// Whales / Bullflow style). Each factor is a labeled bar; clicking opens a modal
// with the in-depth reasoning and a list of Browserbase-grabbed sources.

interface Props {
  factors: GuideFactor[]
}

export function FactorScale({ factors }: Props) {
  const [open, setOpen] = useState<GuideFactor | null>(null)

  return (
    <div className="factor-scale">
      {factors.map((f) => (
        <button
          key={f.key}
          className="factor-row"
          onClick={() => setOpen(f)}
          title="Click for reasoning + sources"
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
        </button>
      ))}

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
            <p className="factor-modal__reasoning">{open.reasoning}</p>
            {open.sources.length > 0 && (
              <div className="factor-modal__sources">
                <span className="factor-modal__sources-title">Sources (via Browserbase)</span>
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
