import { useState } from 'react'
import { StepCompliancePanel } from './StepCompliancePanel'
import { VoiceLogPanel } from './VoiceLogPanel'
import { RFIPanel } from './RFIPanel'

// <LiveBuildSequence> — the 10-step pausable runner (BUILD_PLAN §5).
// Plays from the pre-cached sequence; pauses each step to surface the
// Watchdog's active conditions, with Voice Log + RFI available inline.
// Wired with local state here; data binds to /api/project/:id/sequence in the
// product build-out.
const TOTAL_STEPS = 10

export function LiveBuildSequence() {
  const [step, setStep] = useState(1)

  return (
    <div className="sequence">
      <header className="sequence__header">
        <span>
          Step {step} / {TOTAL_STEPS}
        </span>
        <div className="sequence__controls">
          <button
            className="btn btn--ghost"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
          >
            Back
          </button>
          <button
            className="btn btn--primary"
            onClick={() => setStep((s) => Math.min(TOTAL_STEPS, s + 1))}
            disabled={step === TOTAL_STEPS}
          >
            Continue
          </button>
        </div>
      </header>

      <div className="sequence__body">
        <StepCompliancePanel step={step} />
        <div className="sequence__agents">
          <VoiceLogPanel step={step} />
          <RFIPanel step={step} />
        </div>
      </div>
    </div>
  )
}
