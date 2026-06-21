import { useState } from 'react'
import {
  Mic, MicOff, Box, HelpCircle, ShieldCheck, FileSearch,
  AlertTriangle, Loader2, X, Hammer, FileDown,
} from 'lucide-react'
import { AGENT_BUTTONS, type AgentKey } from '~/lib/planTypes'
import { projectClient } from '~/lib/projectClient'
import { useDictation } from '~/lib/useDictation'

// The 6 agent quick-buttons (spec §3 + §workspace). Each button:
//   • focuses the camera on its mapped mesh group, and
//   • opens a panel that calls its grounded agent endpoint.
// "Edit model" regenerates the 3D model in place; "Log daily work" adds voice
// dictation; "Export to CAD" is a deliberate stub (implementation skipped).

const ICONS: Record<string, typeof Box> = {
  'daily-log': Mic,
  'model-edit': Box,
  rfi: HelpCircle,
  compliance: ShieldCheck,
  'permit-research': FileSearch,
  hazards: AlertTriangle,
}

// Agent button key -> /api/agents/* endpoint (model-edit is handled separately).
const ENDPOINT: Partial<Record<AgentKey, string>> = {
  'daily-log': 'daily-briefing',
  rfi: 'rfi',
  compliance: 'compliance',
  'permit-research': 'permit-research',
  hazards: 'hazards',
}

interface Props {
  projectId: string
  activeStage: string | null
  modelBusy: boolean
  onFocusMesh: (mesh: string) => void
  onEditModel: (idea: string) => void
  /** Fired after any agent run so the project record can refresh. */
  onActivity?: () => void
}

export function AgentDock({
  projectId,
  activeStage,
  modelBusy,
  onFocusMesh,
  onEditModel,
  onActivity,
}: Props) {
  const [open, setOpen] = useState<AgentKey | null>(null)
  const [input, setInput] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dictation = useDictation((text) =>
    setInput((prev) => (prev ? `${prev} ${text}` : text)),
  )

  const select = (key: AgentKey, mesh: string) => {
    onFocusMesh(mesh)
    setOpen(key)
    setInput('')
    setAnswer(null)
  }

  const close = () => {
    dictation.stop()
    setOpen(null)
    setAnswer(null)
    setInput('')
  }

  const run = async () => {
    if (!open) return
    if (open === 'model-edit') {
      if (input.trim()) onEditModel(input.trim())
      close()
      return
    }
    const endpoint = ENDPOINT[open]
    if (!endpoint) return
    setBusy(true)
    setAnswer(null)
    try {
      const body: Record<string, unknown> = { projectId }
      if (open === 'daily-log') body.transcript = input
      else body.question = input
      if (activeStage) body.stage = activeStage
      const res = await projectClient.agent(endpoint, body)
      const text =
        (res.answer as string) ??
        ((res.log as { summary?: string })?.summary ?? '') ??
        'No response.'
      setAnswer(typeof text === 'string' ? text : JSON.stringify(text))
      onActivity?.()
    } catch {
      setAnswer('That agent is unreachable right now — ASI:One fallback did not return in time. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const activeMeta = open ? AGENT_BUTTONS.find((b) => b.key === open) : null

  return (
    <div className="agent-dock">
      <div className="agent-dock__bar">
        {AGENT_BUTTONS.map((b) => {
          const Icon = ICONS[b.key] ?? Box
          const isModelEdit = b.key === 'model-edit'
          return (
            <button
              key={b.key}
              className={`agent-chip${open === b.key ? ' is-open' : ''}${
                isModelEdit ? ' agent-chip--model' : ''
              }`}
              onClick={() => select(b.key, b.mesh)}
              disabled={isModelEdit && modelBusy}
              title={b.label}
            >
              <Icon size={15} />
              <span>{b.label}</span>
            </button>
          )
        })}
        {/* Export to CAD — deliberate stub per spec. */}
        <button className="agent-chip agent-chip--cad" disabled title="CAD export — coming soon">
          <FileDown size={15} />
          <span>Export to CAD</span>
        </button>
      </div>

      {open && activeMeta && (
        <div className="agent-panel">
          <header className="agent-panel__head">
            <span className="agent-panel__title">
              {(() => {
                const Icon = ICONS[open] ?? Box
                return <Icon size={15} />
              })()}
              {activeMeta.label}
            </span>
            <button className="agent-panel__close" onClick={close} aria-label="Close">
              <X size={16} />
            </button>
          </header>

          <div className="agent-panel__body">
            <div className="agent-panel__field">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={3}
                placeholder={
                  open === 'model-edit'
                    ? 'Describe the change — e.g. "make it 6 storeys and add a rooftop terrace"'
                    : open === 'daily-log'
                    ? 'Speak or type today’s site update…'
                    : 'Ask this agent…'
                }
              />
              {dictation.interim && (
                <div className="agent-panel__interim">{dictation.interim}…</div>
              )}
              {open === 'daily-log' && dictation.supported && (
                <button
                  type="button"
                  className={`agent-panel__mic${dictation.listening ? ' is-live' : ''}`}
                  onClick={dictation.toggle}
                >
                  {dictation.listening ? <MicOff size={14} /> : <Mic size={14} />}
                  {dictation.listening ? 'Listening' : 'Voice'}
                </button>
              )}
            </div>

            <button
              className="btn btn--primary agent-panel__run"
              onClick={run}
              disabled={busy || (!input.trim() && open !== 'compliance' && open !== 'permit-research' && open !== 'hazards')}
            >
              {busy ? (
                <>
                  <Loader2 size={14} className="spin" /> Working…
                </>
              ) : open === 'model-edit' ? (
                <>
                  <Hammer size={14} /> Regenerate model
                </>
              ) : (
                'Run agent'
              )}
            </button>

            {answer && <div className="agent-panel__answer">{answer}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
