// <VoiceLogPanel> — mic input -> Deepgram -> structured daily log (Claude),
// inline at any step (POST /api/agents/voice-log). Mic capture wires in the
// agents pass; this is the placement + contract.
export function VoiceLogPanel({ step }: { step: number }) {
  return (
    <section className="panel panel--voice">
      <h4>Voice Log</h4>
      <button className="btn btn--ghost" disabled>
        Hold to record
      </button>
      <p className="panel__placeholder">
        Speak a 30–60s update for step {step}.
      </p>
    </section>
  )
}
