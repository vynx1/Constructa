// ---------------------------------------------------------------------------
// Compliance formatting (spec §5/§6).
//
// Single integration point that turns a raw agent stage-solution into a
// structured compliance document. In production this is performed by a
// dedicated Agentverse / ASI compliance agent (set COMPLIANCE_AGENT_URL).
// If that agent is unset or unreachable we fall back to a deterministic local
// formatter so the generated PDF still looks compliant.
// ---------------------------------------------------------------------------

export interface ComplianceSection {
  heading: string
  body: string
}

export interface ComplianceDoc {
  title: string
  projectRef: string
  stage: string
  date: string
  referenceId: string
  sections: ComplianceSection[]
}

function makeReferenceId(stage: string): string {
  const slug = (stage || 'GEN').toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 12)
  return `CMP-${slug}-${Date.now().toString(36).toUpperCase()}`
}

// Deterministic local formatter — structures raw text into compliance sections.
function localFormat(stage: string, rawSolution: string, projectRef: string): ComplianceDoc {
  const text = (rawSolution || '').trim()

  // Split the raw solution into actionable lines for the "Required Actions"
  // section, and keep the prose for "Findings".
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const actionLines = lines.filter((l) => /^(\d+[.)]|[-*•])\s+/.test(l))
  const proseLines = lines.filter((l) => !/^(\d+[.)]|[-*•])\s+/.test(l))

  const findings = proseLines.join('\n\n') || text || 'No findings recorded.'
  const actions =
    actionLines.length > 0
      ? actionLines.map((l) => l.replace(/^(\d+[.)]|[-*•])\s+/, '• ')).join('\n')
      : '• Review the findings above and confirm completion with the responsible party.'

  return {
    title: 'Compliance Document',
    projectRef,
    stage,
    date: new Date().toISOString().slice(0, 10),
    referenceId: makeReferenceId(stage),
    sections: [
      { heading: 'Project Reference', body: projectRef },
      { heading: 'Stage', body: stage },
      {
        heading: 'Scope',
        body: `This document records the compliance position for the "${stage}" stage of the project, as resolved by the project agents.`,
      },
      { heading: 'Findings', body: findings },
      { heading: 'Required Actions', body: actions },
      {
        heading: 'Sign-off',
        body: 'Prepared automatically by the Constructa compliance pipeline. Requires review and counter-signature by the responsible licensed professional before submission.',
      },
    ],
  }
}

function coerceDoc(
  input: unknown,
  stage: string,
  projectRef: string,
): ComplianceDoc | null {
  if (!input || typeof input !== 'object') return null
  const d = input as Partial<ComplianceDoc>
  if (!Array.isArray(d.sections) || d.sections.length === 0) return null
  return {
    title: typeof d.title === 'string' ? d.title : 'Compliance Document',
    projectRef: typeof d.projectRef === 'string' ? d.projectRef : projectRef,
    stage: typeof d.stage === 'string' ? d.stage : stage,
    date: typeof d.date === 'string' ? d.date : new Date().toISOString().slice(0, 10),
    referenceId: typeof d.referenceId === 'string' ? d.referenceId : makeReferenceId(stage),
    sections: d.sections
      .filter((s): s is ComplianceSection => !!s && typeof s.heading === 'string' && typeof s.body === 'string')
      .map((s) => ({ heading: s.heading, body: s.body })),
  }
}

/**
 * Format a raw agent solution into a structured compliance document.
 * Prefers the external Agentverse/ASI compliance agent; falls back to a
 * deterministic local formatter on any failure.
 */
export async function formatForCompliance(
  stage: string,
  rawSolution: string,
  ctx?: { projectId?: string },
): Promise<ComplianceDoc> {
  const projectRef = ctx?.projectId ?? 'demo'
  const url = process.env.COMPLIANCE_AGENT_URL

  // TODO: slot real Agentverse compliance agent here — the endpoint below is
  // expected to return a ComplianceDoc-shaped JSON payload.
  if (url) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage, content: rawSolution, projectId: projectRef }),
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        const doc = coerceDoc(await res.json(), stage, projectRef)
        if (doc) return doc
      }
    } catch (err) {
      console.warn('[compliance] agent format failed, using local fallback:', (err as Error).message)
    }
  }

  return localFormat(stage, rawSolution, projectRef)
}
