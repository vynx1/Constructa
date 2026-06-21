import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MousePointer2, Send, Bot, Loader2, ShieldCheck, Sparkles, X, ListChecks,
} from 'lucide-react'
import type { ExecutionPlan, PlanStage } from '~/lib/planTypes'
import { projectClient } from '~/lib/projectClient'

// <StageWorkflowDemo> — two halves stacked under the timeline:
//
//  1. An auto-playing LIVE DEMO (home-page cursor style): a cursor glides to the
//     first stage ("Pre-construction compliance"), clicks it, then the next tab
//     reveals a chat where the user is handed the stage's instructables and the
//     assistant offers to help.
//  2. A REAL interactive strip: the user clicks any actual plan stage and a
//     working chatbot assistant opens underneath, grounded in that stage's
//     compliance checklist (calls the RFI agent, with a useful local fallback).

type DemoPhase = 'select' | 'chat'
const SELECT_MS = 4200
const CHAT_MS = 7000
const CURSOR_TRAVEL_MS = 2200

interface Props {
  plan: ExecutionPlan | null
  projectId: string
  activeStage: string
  onSelectStage: (key: string) => void
  onActivity?: () => void
}

export function StageWorkflowDemo({
  plan,
  projectId,
  activeStage,
  onSelectStage,
  onActivity,
}: Props) {
  const [phase, setPhase] = useState<DemoPhase>('select')
  const [clicked, setClicked] = useState(false)
  const [cycle, setCycle] = useState(0)
  const [openStage, setOpenStage] = useState<string | null>(null)

  const demoRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const targetRef = useRef<HTMLButtonElement>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const manualRef = useRef(false)

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  // Auto-loop select → chat → select …
  const loop = useCallback(
    (p: DemoPhase) => {
      setPhase(p)
      if (p === 'select') setCycle((c) => c + 1)
      const ms = p === 'select' ? SELECT_MS : CHAT_MS
      timersRef.current.push(
        setTimeout(() => loop(p === 'select' ? 'chat' : 'select'), ms),
      )
    },
    [],
  )

  useEffect(() => {
    if (manualRef.current) return
    clearTimers()
    loop('select')
    return clearTimers
  }, [loop, clearTimers])

  // Drive the cursor to the first stage and "click" it each select cycle.
  useEffect(() => {
    if (phase !== 'select') return
    setClicked(false)
    const demo = demoRef.current
    const cursor = cursorRef.current
    const target = targetRef.current
    if (!demo || !cursor || !target) return

    const dRect = demo.getBoundingClientRect()
    const tRect = target.getBoundingClientRect()
    if (dRect.width <= 0 || tRect.width <= 0) return

    const end = {
      x: tRect.left - dRect.left + tRect.width / 2,
      y: tRect.top - dRect.top + tRect.height / 2,
    }
    const start = { x: dRect.width - 36, y: 22 }
    cursor.style.left = `${start.x}px`
    cursor.style.top = `${start.y}px`

    const anim = cursor.animate(
      [
        { left: `${start.x}px`, top: `${start.y}px` },
        { left: `${end.x}px`, top: `${end.y}px` },
      ],
      { duration: CURSOR_TRAVEL_MS, fill: 'forwards', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    )
    const clickT = setTimeout(() => setClicked(true), CURSOR_TRAVEL_MS + 120)
    return () => {
      anim.cancel()
      clearTimeout(clickT)
    }
  }, [phase, cycle])

  const jump = useCallback(
    (p: DemoPhase) => {
      manualRef.current = true
      clearTimers()
      setPhase(p)
      if (p === 'select') setCycle((c) => c + 1)
    },
    [clearTimers],
  )

  if (!plan || plan.stages.length === 0) return null

  const firstStage = plan.stages[0]!
  const demoStages = plan.stages.slice(0, 3)
  const openStageObj = openStage ? plan.stages.find((s) => s.key === openStage) ?? null : null

  return (
    <section className="swf" aria-labelledby="swf-heading">
      <header className="swf__header">
        <h2 className="swf__heading" id="swf-heading">
          <Sparkles size={16} /> Guided stage workflow
        </h2>
        <p className="swf__sub">
          Watch the flow, then open a live assistant on any stage to actually work it.
        </p>
      </header>

      {/* ---- Live, auto-playing demo --------------------------------------- */}
      <div className="swf-demo">
        <div className="swf-demo__tabs" role="tablist" aria-label="Demo steps">
          <button
            type="button"
            className={`swf-demo__tab${phase === 'select' ? ' is-active' : ''}`}
            onClick={() => jump('select')}
            role="tab"
            aria-selected={phase === 'select'}
          >
            <span className="swf-demo__tab-num">01</span> Pick a stage
          </button>
          <button
            type="button"
            className={`swf-demo__tab${phase === 'chat' ? ' is-active' : ''}`}
            onClick={() => jump('chat')}
            role="tab"
            aria-selected={phase === 'chat'}
          >
            <span className="swf-demo__tab-num">02</span> Get your checklist
          </button>
        </div>

        <div className="swf-demo__stage" ref={demoRef}>
          {/* Phase 1 — cursor picks the first stage */}
          <div className={`swf-demo__pane${phase === 'select' ? ' is-shown' : ''}`} aria-hidden={phase !== 'select'}>
            <p className="swf-demo__caption">
              Your timeline opens compliance-first. The assistant starts you on the required stage.
            </p>
            <div className="swf-demo__rail">
              {demoStages.map((s, i) => (
                <button
                  key={s.key}
                  ref={i === 0 ? targetRef : undefined}
                  className={`swf-demo__pill${i === 0 ? ' swf-demo__pill--first' : ''}${
                    i === 0 && clicked ? ' is-clicked' : ''
                  }`}
                  tabIndex={-1}
                >
                  <span className="swf-demo__pill-node">{i + 1}</span>
                  <span className="swf-demo__pill-text">
                    {s.title}
                    {i === 0 && (
                      <span className="swf-demo__pill-flag">
                        <ShieldCheck size={10} /> required first
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
            <div
              ref={cursorRef}
              className={`swf-cursor${clicked ? ' swf-cursor--clicked' : ''}`}
              aria-hidden
            >
              <MousePointer2 size={20} />
            </div>
          </div>

          {/* Phase 2 — chat hands over the instructables */}
          <div className={`swf-demo__pane swf-demo__chatpane${phase === 'chat' ? ' is-shown' : ''}`} aria-hidden={phase !== 'chat'}>
            <div className="swf-chat__msg swf-chat__msg--user">
              I picked “{firstStage.title}”. What do I need to do?
            </div>
            <div className="swf-chat__msg swf-chat__msg--bot">
              <div className="swf-chat__bot-head">
                <Bot size={14} /> Compliance assistant
              </div>
              <p className="swf-chat__line">Here’s your checklist to clear this stage:</p>
              <ul className="swf-chat__list">
                {firstStage.compliance.slice(0, 4).map((item) => (
                  <li key={item}>
                    <ListChecks size={12} /> {item}
                  </li>
                ))}
              </ul>
              <p className="swf-chat__line">
                Want me to draft the first one or explain a requirement? Open a stage below 👇
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Real interactive: click a stage → working assistant ----------- */}
      <div className="swf-work">
        <div className="swf-work__label">
          <Sparkles size={13} /> Open an assistant on a stage
        </div>
        <div className="swf-work__stages">
          {plan.stages.map((s) => {
            const isOpen = openStage === s.key
            return (
              <button
                key={s.key}
                className={`swf-work__chip${isOpen ? ' is-open' : ''}${
                  s.key === activeStage ? ' is-active' : ''
                }`}
                onClick={() => {
                  onSelectStage(s.key)
                  setOpenStage(isOpen ? null : s.key)
                }}
              >
                {s.title}
              </button>
            )
          })}
        </div>

        {openStageObj && (
          <StageAssistant
            key={openStageObj.key}
            projectId={projectId}
            stage={openStageObj}
            onActivity={onActivity}
            onClose={() => setOpenStage(null)}
          />
        )}
      </div>
    </section>
  )
}

// --- The grounded, working chatbot for a single stage ----------------------

interface ChatMsg {
  role: 'user' | 'bot'
  text: string
  items?: string[]
}

function localHelp(stage: PlanStage, question: string): string {
  const items = stage.compliance.length ? stage.compliance : ['scope the work', 'confirm requirements']
  const first = items[0]
  const q = question.toLowerCase()
  if (/first|start|begin|where/.test(q)) {
    return `Start ${stage.title} with "${first}". Pull the parcel record, confirm the applicable code section, and file the initial paperwork — then the rest of the checklist unblocks. Want the step-by-step for that item?`
  }
  if (/cost|budget|price|\$/.test(q)) {
    return `${stage.title} is budgeted around $${(Number(stage.estCost) / 1000).toFixed(0)}k over ~${stage.durationWeeks} weeks. The compliance items above are what drive that number — clearing them early avoids re-review fees.`
  }
  if (/law|code|regulation|permit/.test(q) && stage.localLaws.length) {
    return `The governing references for ${stage.title} are: ${stage.localLaws.join(', ')}. Map each checklist item to one of those before submitting, so plan-check has nothing to bounce.`
  }
  return `For ${stage.title}, focus on: ${items.slice(0, 3).join('; ')}. I'd tackle "${first}" first. Ask me to break any item into concrete steps, or have an agent auto-solve it from the timeline.`
}

function StageAssistant({
  projectId,
  stage,
  onActivity,
  onClose,
}: {
  projectId: string
  stage: PlanStage
  onActivity?: () => void
  onClose: () => void
}) {
  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    {
      role: 'bot',
      text: `Let’s work on ${stage.title}. Here’s what needs doing to clear it:`,
      items: stage.compliance.length ? stage.compliance : ['Confirm scope', 'Verify requirements'],
    },
    { role: 'bot', text: 'Tell me which item to tackle, or ask anything about this stage.' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim()
      if (!q || busy) return
      setMessages((m) => [...m, { role: 'user', text: q }])
      setInput('')
      setBusy(true)
      try {
        const res = await projectClient.agent('rfi', {
          projectId,
          question: `Stage: ${stage.title}. ${q}`,
          stage: stage.key,
        })
        const answer =
          (res.answer as string) ||
          ((res.log as { summary?: string })?.summary ?? '') ||
          localHelp(stage, q)
        setMessages((m) => [...m, { role: 'bot', text: answer }])
        onActivity?.()
      } catch {
        setMessages((m) => [...m, { role: 'bot', text: localHelp(stage, q) }])
      } finally {
        setBusy(false)
      }
    },
    [busy, projectId, stage, onActivity],
  )

  const quick = stage.compliance[0]
    ? `How do I start "${stage.compliance[0]}"?`
    : `How do I start ${stage.title}?`

  return (
    <div className="stage-assistant">
      <header className="stage-assistant__head">
        <span className="stage-assistant__title">
          <Bot size={15} /> {stage.title} assistant
        </span>
        <button className="stage-assistant__close" onClick={onClose} aria-label="Close assistant">
          <X size={15} />
        </button>
      </header>

      <div className="stage-assistant__log" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`stage-msg stage-msg--${m.role}`}>
            {m.role === 'bot' && (
              <span className="stage-msg__avatar"><Bot size={13} /></span>
            )}
            <div className="stage-msg__bubble">
              <p className="stage-msg__text">{m.text}</p>
              {m.items && (
                <ul className="stage-msg__items">
                  {m.items.map((it) => (
                    <li key={it}><ShieldCheck size={11} /> {it}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="stage-msg stage-msg--bot">
            <span className="stage-msg__avatar"><Bot size={13} /></span>
            <div className="stage-msg__bubble stage-msg__bubble--typing">
              <Loader2 size={13} className="spin" /> thinking…
            </div>
          </div>
        )}
      </div>

      <div className="stage-assistant__quick">
        <button className="stage-assistant__chip" onClick={() => ask(quick)} disabled={busy}>
          {quick}
        </button>
        <button
          className="stage-assistant__chip"
          onClick={() => ask(`What local laws apply to ${stage.title}?`)}
          disabled={busy}
        >
          What laws apply?
        </button>
      </div>

      <form
        className="stage-assistant__form"
        onSubmit={(e) => {
          e.preventDefault()
          ask(input)
        }}
      >
        <input
          className="stage-assistant__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask about ${stage.title}…`}
          disabled={busy}
        />
        <button className="stage-assistant__send" type="submit" disabled={busy || !input.trim()} aria-label="Send">
          {busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
        </button>
      </form>
    </div>
  )
}
