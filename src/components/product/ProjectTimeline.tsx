import { useEffect, useState } from 'react'
import { Check, Clock, DollarSign, Scale, ShieldCheck, Loader2, Wand2 } from 'lucide-react'
import type { ExecutionPlan, PlanStage, StageKey, AgentKey } from '~/lib/planTypes'

// Vertical optimization timeline (spec §3). Stages come from ASI:One's 6-agent
// universal plan, compliance-first. On arrival the plan is "typed out" to the
// user, then a proper interactive timeline is revealed. Selecting a stage drives
// the model camera; expanding a stage exposes agent buttons that auto-solve its
// compliance work (#4).

// Which agents can auto-resolve each stage's compliance work.
const STAGE_AGENTS: Record<StageKey, AgentKey[]> = {
  'compliance-workflow': ['compliance', 'permit-research', 'hazards'],
  foundation: ['hazards', 'compliance'],
  structure: ['compliance'],
  systems: ['compliance'],
  envelope: ['permit-research', 'compliance'],
  finish: ['permit-research', 'compliance'],
}

const AGENT_LABEL: Record<string, string> = {
  compliance: 'Compliance agent',
  'permit-research': 'Permit research',
  hazards: 'Hazards agent',
}

interface Props {
  plan: ExecutionPlan | null
  activeStage: string | null
  onSelectStage: (stageKey: string) => void
  solved: Set<string>
  onSolve: (stage: PlanStage, item: string) => void
  onAutoSolve: (stage: PlanStage, agent: AgentKey) => Promise<string>
}

function buildNarration(plan: ExecutionPlan): string {
  const lines = [
    'ASI:One · 6 agents → optimized execution plan',
    plan.headline,
    '',
    ...plan.stages.map(
      (s, i) => `▸ ${i + 1}. ${s.title} — ${s.durationWeeks} wk · ${s.estCost}`,
    ),
    '',
    `Σ  ${plan.totalCost} · ~${Math.round(plan.totalWeeks / 4.33)} months`,
  ]
  return lines.join('\n')
}

export function ProjectTimeline({
  plan,
  activeStage,
  onSelectStage,
  solved,
  onSolve,
  onAutoSolve,
}: Props) {
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')

  // Type the plan out, then reveal the interactive timeline.
  useEffect(() => {
    if (!plan) {
      setRevealed(false)
      setTyped('')
      return
    }
    setRevealed(false)
    const narration = buildNarration(plan)
    let i = 0
    const interval = setInterval(() => {
      i += 3
      setTyped(narration.slice(0, i))
      if (i >= narration.length) {
        clearInterval(interval)
        setTimeout(() => setRevealed(true), 400)
      }
    }, 16)
    return () => clearInterval(interval)
  }, [plan])

  if (!plan) {
    return (
      <div className="timeline timeline--loading">
        <div className="timeline__skeleton" />
        <p>Six agents are drafting your optimized execution plan…</p>
      </div>
    )
  }

  if (!revealed) {
    return (
      <div className="timeline timeline--typing">
        <div className="timeline__typing-label">
          <Wand2 size={13} /> Drafting timeline
        </div>
        <pre className="timeline__typing-text">
          {typed}
          <span className="timeline__caret" />
        </pre>
      </div>
    )
  }

  return (
    <div className="timeline timeline--revealed">
      <header className="timeline__summary">
        <div>
          <h3 className="timeline__title">Optimized execution timeline</h3>
          <p className="timeline__headline">{plan.headline}</p>
        </div>
        <div className="timeline__totals">
          <span>
            <DollarSign size={13} /> {plan.totalCost}
          </span>
          <span>
            <Clock size={13} /> ~{Math.round(plan.totalWeeks / 4.33)} mo
          </span>
        </div>
      </header>

      <ol className="timeline__list">
        {plan.stages.map((stage, i) => {
          const isActive = stage.key === activeStage
          const isCompliance = stage.key === 'compliance-workflow'
          return (
            <li
              key={stage.key}
              className={`timeline-stage${isActive ? ' is-active' : ''}${
                isCompliance ? ' timeline-stage--compliance' : ''
              }`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <button
                className="timeline-stage__head"
                onClick={() => onSelectStage(stage.key)}
              >
                <span className="timeline-stage__node">{i + 1}</span>
                <span className="timeline-stage__heading">
                  <span className="timeline-stage__name">
                    {stage.title}
                    {isCompliance && (
                      <span className="timeline-stage__flag">
                        <ShieldCheck size={11} /> required first
                      </span>
                    )}
                  </span>
                  <span className="timeline-stage__meta">
                    {stage.durationWeeks} wk · {stage.estCost}
                  </span>
                </span>
              </button>

              {isActive && (
                <div className="timeline-stage__body">
                  <p className="timeline-stage__summary">{stage.summary}</p>

                  <div className="timeline-stage__section">
                    <div className="timeline-stage__section-title">
                      <ShieldCheck size={12} /> CORE compliance work
                    </div>
                    <ul className="timeline-stage__checklist">
                      {stage.compliance.map((item) => {
                        const key = `${stage.key}:${item}`
                        const done = solved.has(key)
                        return (
                          <li key={key} className={done ? 'is-done' : ''}>
                            <button
                              className="timeline-stage__check"
                              onClick={() => onSolve(stage, item)}
                              aria-pressed={done}
                            >
                              <span className="timeline-stage__checkbox">
                                {done && <Check size={11} />}
                              </span>
                              {item}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>

                  <div className="timeline-stage__section">
                    <div className="timeline-stage__section-title">
                      <Scale size={12} /> Important local laws
                    </div>
                    <div className="timeline-stage__laws">
                      {stage.localLaws.map((law) => (
                        <span key={law} className="timeline-stage__law">
                          {law}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* #4 — agents that can auto-solve this stage's compliance. */}
                  <div className="timeline-stage__autosolve">
                    <div className="timeline-stage__section-title">
                      <Wand2 size={12} /> Let an agent solve it
                    </div>
                    <div className="timeline-stage__autosolve-row">
                      {(STAGE_AGENTS[stage.key] ?? []).map((agent) => (
                        <AutoSolveButton
                          key={agent}
                          label={AGENT_LABEL[agent] ?? agent}
                          onRun={() => onAutoSolve(stage, agent)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function AutoSolveButton({
  label,
  onRun,
}: {
  label: string
  onRun: () => Promise<string>
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [answer, setAnswer] = useState<string | null>(null)

  const run = async () => {
    setState('busy')
    try {
      const res = await onRun()
      setAnswer(res)
      setState('done')
    } catch {
      setAnswer('Agent unreachable — try again.')
      setState('idle')
    }
  }

  return (
    <div className="autosolve">
      <button
        className={`autosolve__btn${state === 'done' ? ' is-done' : ''}`}
        onClick={run}
        disabled={state === 'busy'}
      >
        {state === 'busy' ? (
          <Loader2 size={12} className="spin" />
        ) : state === 'done' ? (
          <Check size={12} />
        ) : (
          <Wand2 size={12} />
        )}
        {label}
      </button>
      {answer && <div className="autosolve__answer">{answer}</div>}
    </div>
  )
}
