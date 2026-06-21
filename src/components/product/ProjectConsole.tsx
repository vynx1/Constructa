import { useState } from 'react'
import { Mic, MicOff, Hammer, Loader2, Cpu } from 'lucide-react'
import { useDictation } from '~/lib/useDictation'

// Left side of the intake phase (spec): "start your own project".
// A console that takes the construction idea, then kicks off ASI:One model
// generation while the 6 agents draft the universal execution plan in parallel.

export type GenPhase = 'idle' | 'model' | 'plan' | 'done'

const AGENT_STEPS = [
  'Routing your idea through ASI:One…',
  'Assembling the Three.js component registry…',
  'Delegating 6 specialist agents for the execution plan…',
  'Estimating cost, schedule & compliance timeline…',
]

interface Props {
  districtLabel: string | null
  phase: GenPhase
  onGenerate: (idea: string) => void
}

export function ProjectConsole({ districtLabel, phase, onGenerate }: Props) {
  const [idea, setIdea] = useState('')
  const dictation = useDictation((text) =>
    setIdea((prev) => (prev ? `${prev} ${text}` : text)),
  )

  const busy = phase === 'model' || phase === 'plan'
  const stepIndex = phase === 'model' ? 1 : phase === 'plan' ? 3 : 0

  return (
    <section className="project-console">
      <div className="project-console__eyebrow">Start your own project</div>
      <h2 className="project-console__title">Describe what you want to build</h2>
      {districtLabel && (
        <p className="project-console__parcel">
          On parcel · <strong>{districtLabel}</strong>
        </p>
      )}

      <div className="project-console__field">
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="e.g. a three-story mixed-use building with ground-floor retail and 18 apartments above"
          rows={5}
          disabled={busy}
        />
        {dictation.interim && (
          <div className="project-console__interim">{dictation.interim}…</div>
        )}
        {dictation.supported && (
          <button
            type="button"
            className={`project-console__mic${dictation.listening ? ' is-live' : ''}`}
            onClick={dictation.toggle}
            disabled={busy}
            aria-label={dictation.listening ? 'Stop dictation' : 'Dictate your idea'}
          >
            {dictation.listening ? <MicOff size={16} /> : <Mic size={16} />}
            {dictation.listening ? 'Listening' : 'Speak'}
          </button>
        )}
      </div>

      <button
        className="btn btn--primary project-console__cta"
        onClick={() => idea.trim() && onGenerate(idea.trim())}
        disabled={busy || !idea.trim()}
      >
        {busy ? (
          <>
            <Loader2 size={16} className="spin" /> Generating…
          </>
        ) : (
          <>
            <Hammer size={16} /> Generate 3D model & plan
          </>
        )}
      </button>

      {busy && (
        <ul className="project-console__progress">
          {AGENT_STEPS.map((label, i) => (
            <li
              key={label}
              className={
                i < stepIndex
                  ? 'is-done'
                  : i === stepIndex
                  ? 'is-active'
                  : 'is-pending'
              }
            >
              {i === stepIndex ? (
                <Loader2 size={13} className="spin" />
              ) : (
                <Cpu size={13} />
              )}
              {label}
            </li>
          ))}
        </ul>
      )}

      <p className="project-console__hint">
        ASI:One authors the model from a constrained primitive library and, in
        parallel, delegates the six specialist agents to build your cost, schedule,
        and compliance timeline.
      </p>
    </section>
  )
}
