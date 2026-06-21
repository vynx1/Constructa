// ---------------------------------------------------------------------------
// Pure plan types + constants shared by the server execution-plan generator
// (src/lib/executionPlan.ts) and the client workspace UI. No server deps so it
// is safe to import from React components.
// ---------------------------------------------------------------------------

// Canonical stage order. `mesh` is the model group the camera frames when the
// timeline stage (or matching agent button) becomes active.
export const STAGE_ORDER = [
  { key: 'compliance-workflow', mesh: 'foundation_slab', title: 'Pre-construction compliance' },
  { key: 'foundation', mesh: 'foundation_slab', title: 'Foundation' },
  { key: 'structure', mesh: 'structural_frame', title: 'Structure' },
  { key: 'systems', mesh: 'mep_layer', title: 'Systems (MEP)' },
  { key: 'envelope', mesh: 'envelope_facade', title: 'Envelope & facade' },
  { key: 'finish', mesh: 'roof_form', title: 'Finish & closeout' },
] as const

export type StageKey = (typeof STAGE_ORDER)[number]['key']

export interface PlanStage {
  key: StageKey
  mesh: string
  title: string
  summary: string
  durationWeeks: number
  estCost: string
  compliance: string[]
  localLaws: string[]
  agents: string[]
}

export interface ExecutionPlan {
  projectId: string
  district: string | null
  buildingType: string
  floors: number
  totalCost: string
  totalWeeks: number
  headline: string
  stages: PlanStage[]
  source: string
}

// The 6 agents that act as the workspace quick-buttons (spec §3). `mesh` is the
// model group the camera focuses when the button is pressed.
export const AGENT_BUTTONS = [
  { key: 'daily-log', label: 'Log daily work', mesh: 'structural_frame', icon: 'mic' },
  { key: 'model-edit', label: 'Edit model', mesh: 'envelope_facade', icon: 'box' },
  { key: 'rfi', label: 'RFI resolution', mesh: 'mep_layer', icon: 'help' },
  { key: 'compliance', label: 'Compliance workflows', mesh: 'foundation_slab', icon: 'shield' },
  { key: 'permit-research', label: 'Permit research', mesh: 'envelope_facade', icon: 'file' },
  { key: 'hazards', label: 'Hazards', mesh: 'foundation_slab', icon: 'alert' },
] as const

export type AgentKey = (typeof AGENT_BUTTONS)[number]['key']

// Timeline stage -> model mesh group (spec §3 STAGE_TO_MESH).
export const STAGE_TO_MESH: Record<string, string> = Object.fromEntries(
  STAGE_ORDER.map((s) => [s.key, s.mesh]),
)
