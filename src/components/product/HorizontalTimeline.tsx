// HorizontalTimeline — interactive horizontal project timeline.
// Computes actual calendar dates from each stage's durationWeeks so the team
// sees real milestones rather than abstract week-counts. Clicking a segment
// navigates the workspace to that stage.

import { useMemo, useRef, useEffect } from 'react'
import type { ExecutionPlan, PlanStage } from '~/lib/planTypes'

interface Milestone {
  stage: PlanStage
  startDate: Date
  endDate: Date
  startWeek: number
  durationWeeks: number
  pct: number
  widthPct: number
}

const STAGE_PALETTE: Record<string, { bg: string; border: string }> = {
  'compliance-workflow': { bg: 'rgba(251, 191, 36, 0.18)', border: '#fbbf24' },
  foundation: { bg: 'rgba(96, 165, 250, 0.18)', border: '#60a5fa' },
  structure: { bg: 'rgba(167, 139, 250, 0.18)', border: '#a78bfa' },
  systems: { bg: 'rgba(52, 211, 153, 0.18)', border: '#34d399' },
  envelope: { bg: 'rgba(248, 113, 113, 0.18)', border: '#f87171' },
  finish: { bg: 'rgba(251, 146, 60, 0.18)', border: '#fb923c' },
}

function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + Math.round(weeks * 7))
  return d
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatMonth(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function buildMilestones(plan: ExecutionPlan, start: Date): Milestone[] {
  const total = plan.stages.reduce((s, st) => s + st.durationWeeks, 0) || 1
  let cursor = 0
  return plan.stages.map((stage) => {
    const startDate = addWeeks(start, cursor)
    const endDate = addWeeks(start, cursor + stage.durationWeeks)
    const m: Milestone = {
      stage,
      startDate,
      endDate,
      startWeek: cursor,
      durationWeeks: stage.durationWeeks,
      pct: (cursor / total) * 100,
      widthPct: (stage.durationWeeks / total) * 100,
    }
    cursor += stage.durationWeeks
    return m
  })
}

interface HorizontalTimelineProps {
  plan: ExecutionPlan | null
  activeStage: string
  onSelectStage: (key: string) => void
  startDate?: Date
}

export function HorizontalTimeline({
  plan,
  activeStage,
  onSelectStage,
  startDate,
}: HorizontalTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const start = startDate ?? new Date()

  const milestones = useMemo(
    () => (plan ? buildMilestones(plan, start) : []),
    [plan, start],
  )

  // Scroll active segment into view when activeStage changes.
  useEffect(() => {
    const el = scrollRef.current?.querySelector(`[data-stage="${activeStage}"]`) as HTMLElement | null
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeStage])

  if (!milestones.length) return null

  const totalWeeks = plan!.stages.reduce((s, st) => s + st.durationWeeks, 0)
  const endDate = addWeeks(start, totalWeeks)

  // Month tick marks
  const monthTicks: { label: string; pct: number }[] = []
  const tick = new Date(start.getFullYear(), start.getMonth(), 1)
  tick.setMonth(tick.getMonth() + 1)
  const ms = endDate.getTime() - start.getTime()
  while (tick < endDate) {
    const pct = ((tick.getTime() - start.getTime()) / ms) * 100
    monthTicks.push({ label: formatMonth(tick), pct })
    tick.setMonth(tick.getMonth() + 1)
  }

  return (
    <section className="htl" aria-labelledby="htl-heading">
      <header className="htl__header">
        <h2 className="htl__heading" id="htl-heading">Project Timeline</h2>
        <div className="htl__meta">
          <span className="htl__date-range">
            {formatDate(start)} → {formatDate(endDate)}
          </span>
          <span className="htl__totals">
            {totalWeeks}w · ${(Number(plan!.totalCost) / 1000).toFixed(0)}k
          </span>
        </div>
      </header>

      <div className="htl__track-wrap" ref={scrollRef}>
        {/* Month tick marks */}
        <div className="htl__ticks" aria-hidden>
          {monthTicks.map(({ label, pct }) => (
            <span
              key={label + pct}
              className="htl__tick"
              style={{ left: `${pct}%` }}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Stage segments */}
        <div className="htl__track" role="list" aria-label="Project stage timeline">
          {milestones.map(({ stage, startDate: sd, endDate: ed, pct, widthPct }) => {
            const palette = STAGE_PALETTE[stage.key] ?? { bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.3)' }
            const isActive = stage.key === activeStage

            return (
              <button
                key={stage.key}
                data-stage={stage.key}
                className={`htl__segment ${isActive ? 'htl__segment--active' : ''}`}
                style={{
                  left: `${pct}%`,
                  width: `${widthPct}%`,
                  background: palette.bg,
                  borderColor: palette.border,
                  boxShadow: isActive ? `0 0 0 2px ${palette.border}` : undefined,
                }}
                onClick={() => onSelectStage(stage.key)}
                role="listitem"
                aria-pressed={isActive}
                aria-label={`${stage.title}: ${formatDate(sd)} to ${formatDate(ed)}`}
              >
                <span className="htl__seg-label" style={{ color: palette.border }}>
                  {stage.title}
                </span>
                <span className="htl__seg-dates">
                  {formatDate(sd)} – {formatDate(ed)}
                </span>
                <span className="htl__seg-dur">{stage.durationWeeks}w</span>

                {isActive && (
                  <span className="htl__seg-active-pip" style={{ background: palette.border }} aria-hidden />
                )}
              </button>
            )
          })}
        </div>

        {/* Today marker */}
        <div
          className="htl__today"
          style={{ left: '0%' }}
          aria-hidden
        >
          <span className="htl__today-label">Today</span>
        </div>
      </div>

      {/* Stage legend pills below track */}
      <div className="htl__legend" aria-label="Stage legend">
        {milestones.map(({ stage }) => {
          const palette = STAGE_PALETTE[stage.key] ?? { bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.3)' }
          return (
            <button
              key={stage.key}
              className={`htl__legend-pill ${stage.key === activeStage ? 'htl__legend-pill--active' : ''}`}
              style={{ borderColor: palette.border, color: palette.border }}
              onClick={() => onSelectStage(stage.key)}
            >
              <span
                className="htl__legend-dot"
                style={{ background: palette.border }}
                aria-hidden
              />
              {stage.title}
            </button>
          )
        })}
      </div>
    </section>
  )
}
