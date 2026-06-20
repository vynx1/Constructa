// <StepCompliancePanel> — shows the Compliance Watchdog's flagged conditions
// at the current pause (GET /api/agents/watchdog/:projectId/:step).
export function StepCompliancePanel({ step }: { step: number }) {
  return (
    <section className="panel panel--compliance">
      <h3>Active compliance — step {step}</h3>
      <p className="panel__placeholder">
        Watchdog conditions for this step appear here.
      </p>
    </section>
  )
}
