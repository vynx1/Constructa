// ---------------------------------------------------------------------------
// Arize observability logger (BUILD_PLAN §1 + master plan §3C).
//
// Arize watches every agent / classifier call. A failure, timeout, or
// low-confidence response is the *trigger condition* for the ASI:One fallback
// (BUILD_PLAN §3, step 2). This is a thin server-side logger: when ARIZE keys
// are set it can POST spans to Arize; otherwise it logs to stdout so the
// fallback decision points are still visible during a demo.
// ---------------------------------------------------------------------------

interface SuccessSpan {
  agentId: string
  metrics?: { tokens?: number; latencyMs?: number; confidence?: number }
}

interface FallbackSpan {
  cause: string
  assignedAgent: string
}

const enabled = () =>
  Boolean(process.env.ARIZE_API_KEY && process.env.ARIZE_SPACE_ID)

function emit(kind: string, payload: unknown) {
  // In a fuller build this batches OpenInference spans to Arize. For the
  // hackathon we log structured lines so the fallback story is observable.
  if (enabled()) {
    // TODO: POST to Arize spans endpoint with ARIZE_SPACE_ID / ARIZE_API_KEY.
  }
  console.log(`[arize:${kind}]`, JSON.stringify(payload))
}

export const arize = {
  logSuccess(span: SuccessSpan) {
    emit('success', span)
  },
  logFallbackTriggered(span: FallbackSpan) {
    emit('fallback', span)
  },
  logError(agentId: string, message: string) {
    emit('error', { agentId, message })
  },
}
