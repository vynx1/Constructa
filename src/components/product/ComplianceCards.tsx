// ComplianceCards — shows what compliance each plan stage needs for THIS specific
// project. ASI:One analyses the project idea+district and returns a short list of
// the most critical compliance items per stage. Cards render in a dark glassmorphic
// grid that matches the home-page aesthetic.

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ExecutionPlan, PlanStage } from '~/lib/planTypes'

interface StageCard {
  stage: PlanStage
  laws: string[]
  summary: string
  risk: 'low' | 'medium' | 'high'
}

interface ComplianceCardsProps {
  plan: ExecutionPlan | null
  projectId: string | null
  activeStage: string
  onSelectStage: (key: string) => void
}

const RISK_COLOR = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
} as const

const RISK_LABEL = {
  low: 'Low risk',
  medium: 'Med risk',
  high: 'High risk',
} as const

function deriveCards(plan: ExecutionPlan): StageCard[] {
  return plan.stages.map((stage) => {
    const count = stage.compliance.length + stage.localLaws.length
    const risk: 'low' | 'medium' | 'high' =
      count >= 6 ? 'high' : count >= 3 ? 'medium' : 'low'
    return {
      stage,
      laws: stage.localLaws.slice(0, 3),
      summary: stage.summary,
      risk,
    }
  })
}

export function ComplianceCards({
  plan,
  activeStage,
  onSelectStage,
}: ComplianceCardsProps) {
  const [cards, setCards] = useState<StageCard[]>([])
  // Track the open ROW (not a single card) so opening one card expands every
  // card sharing its row — no more lopsided empty gaps next to the open one.
  const [openRow, setOpenRow] = useState<number | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(1)

  const build = useCallback(() => {
    if (plan) setCards(deriveCards(plan))
  }, [plan])

  useEffect(() => {
    build()
  }, [build])

  // Derive the live column count from the resolved grid tracks so row grouping
  // stays correct across breakpoints (3 → 2 → 1 columns).
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const measure = () => {
      const tracks = getComputedStyle(grid).gridTemplateColumns
      const n = tracks && tracks !== 'none' ? tracks.split(' ').length : 1
      setCols((prev) => (prev !== n ? n : prev))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(grid)
    return () => ro.disconnect()
  }, [cards.length])

  if (!cards.length) return null

  return (
    <section className="compliance-cards" aria-labelledby="compliance-cards-heading">
      <header className="compliance-cards__header">
        <h2 className="compliance-cards__heading" id="compliance-cards-heading">
          Project Compliance Map
        </h2>
        <p className="compliance-cards__sub">
          Powered by Fetch AI ASI:One · California CBC 2022 / Title 24 / CEQA
        </p>
      </header>

      <div className="compliance-cards__grid" ref={gridRef}>
        {cards.map(({ stage, laws, summary, risk }, index) => {
          const isActive = stage.key === activeStage
          const row = Math.floor(index / cols)
          const isOpen = openRow === row

          return (
            <article
              key={stage.key}
              className={`compliance-card ${isActive ? 'compliance-card--active' : ''}${
                isOpen ? ' compliance-card--open' : ''
              }`}
              aria-expanded={isOpen}
            >
              <button
                className="compliance-card__top"
                onClick={() => {
                  onSelectStage(stage.key)
                  setOpenRow(isOpen ? null : row)
                }}
                aria-label={`${stage.title} — ${RISK_LABEL[risk]}`}
              >
                <span
                  className="compliance-card__risk-dot"
                  style={{ background: RISK_COLOR[risk] }}
                  aria-hidden
                />
                <span className="compliance-card__title">{stage.title}</span>
                <span className="compliance-card__risk-badge" style={{ color: RISK_COLOR[risk] }}>
                  {RISK_LABEL[risk]}
                </span>
                <span className="compliance-card__chevron" aria-hidden>
                  {isOpen ? '▲' : '▼'}
                </span>
              </button>

              {isOpen && (
                <div className="compliance-card__body">
                  <p className="compliance-card__summary">{summary}</p>

                  <div className="compliance-card__section">
                    <h3 className="compliance-card__section-title">Required Compliance</h3>
                    <ul className="compliance-card__list">
                      {stage.compliance.map((item) => (
                        <li key={item} className="compliance-card__item">
                          <span className="compliance-card__check">✓</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {laws.length > 0 && (
                    <div className="compliance-card__section">
                      <h3 className="compliance-card__section-title">Applicable Laws</h3>
                      <ul className="compliance-card__list compliance-card__list--laws">
                        {laws.map((law) => (
                          <li key={law} className="compliance-card__item compliance-card__item--law">
                            {law}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="compliance-card__meta">
                    <span>~{stage.durationWeeks}w</span>
                    <span>${(Number(stage.estCost) / 1000).toFixed(0)}k est.</span>
                    <span>{stage.agents.length} agent{stage.agents.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
