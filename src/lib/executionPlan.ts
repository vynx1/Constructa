// ---------------------------------------------------------------------------
// Universal execution plan — the 6 agents → a staged optimization timeline.
//
// While the 3D model generates, ASI:One delegates the six Constructa specialist
// agents to produce ONE universal execution plan covering: estimated cost,
// estimated time-to-completion, the compliance workflow + timeline, important
// local laws, and CORE compliance work. The plan is structured as a VERTICAL
// TIMELINE whose stage keys line up with the model's named mesh groups so the
// camera can focus the relevant part of the building at each stage:
//
//   compliance-workflow → foundation_slab   (pre-construction, always first)
//   foundation          → foundation_slab
//   structure           → structural_frame
//   systems             → mep_layer
//   envelope            → envelope_facade
//   finish              → roof_form
//
// Env-guarded: with no ASI key (or any failure) it degrades to a deterministic,
// district-aware plan so the timeline always renders.
// ---------------------------------------------------------------------------

import { getRedis, keys } from '~/lib/redis'
import { arize } from '~/lib/arize'
import { asiJson, hasAsiKey } from '~/lib/asi'
import { parseIdea } from '~/lib/modelScaffold'
import { STAGE_ORDER, type ExecutionPlan, type PlanStage } from '~/lib/planTypes'

export { STAGE_ORDER, AGENT_BUTTONS } from '~/lib/planTypes'
export type { ExecutionPlan, PlanStage, StageKey, AgentKey } from '~/lib/planTypes'

const PLAN_SYSTEM =
  'You are ASI:One acting as Constructa\'s lead orchestrator. Delegate to SIX specialist ' +
  'agents (permit research, hazards, zoning/compliance, cost estimator, scheduling, ' +
  'systems/MEP) to produce ONE universal execution plan for a construction project in a ' +
  'heavily-regulated California district. Return STRICT JSON: ' +
  '{ "buildingType": <string>, "floors": <int>, "totalCost": <string like "$4.2M">, ' +
  '"totalWeeks": <int>, "headline": <one decisive sentence>, "stages": [ { "key": ' +
  '"compliance-workflow"|"foundation"|"structure"|"systems"|"envelope"|"finish", ' +
  '"summary": <1-2 sentences>, "durationWeeks": <int>, "estCost": <string>, ' +
  '"compliance": <string[] of CORE compliance work>, "localLaws": <string[] of important ' +
  'local laws/codes that bind this stage>, "agents": <string[] of which specialists own it> } ] }. ' +
  'Include ALL six stage keys in that exact order; "compliance-workflow" is the ' +
  'pre-construction stage and MUST come first. Be specific to California (CEQA, Title 24, ' +
  'CBC, SB 35 / AB 130 streamlining, CAL FIRE / FEMA where relevant).'

/** Generate (or regenerate) the universal execution plan for a project. */
export async function generateExecutionPlan(
  projectId: string,
  idea: string,
  district: string | null,
  context?: string,
): Promise<ExecutionPlan> {
  if (!hasAsiKey()) {
    arize.logSuccess({ agentId: 'asi_exec_plan(deterministic)' })
    const plan = deterministicPlan(projectId, idea, district)
    await persistPlan(projectId, plan)
    return plan
  }

  const user =
    `Project idea: ${idea}\n` +
    `District / parcel: ${district ?? 'unspecified California parcel'}\n` +
    (context ? `Area context: ${context}\n` : '') +
    `Produce the universal execution plan now.`

  try {
    const json = await asiJson(user, PLAN_SYSTEM, 16_000)
    const plan = normalizePlan(JSON.parse(json), projectId, idea, district)
    arize.logSuccess({ agentId: 'asi_exec_plan' })
    await persistPlan(projectId, plan)
    return plan
  } catch (err) {
    arize.logError('asi_exec_plan', (err as Error).message)
    const plan = deterministicPlan(projectId, idea, district)
    await persistPlan(projectId, plan)
    return plan
  }
}

function normalizePlan(
  raw: unknown,
  projectId: string,
  idea: string,
  district: string | null,
): ExecutionPlan {
  const fb = deterministicPlan(projectId, idea, district)
  const obj = (raw ?? {}) as Record<string, unknown>
  const rawStages = Array.isArray(obj.stages) ? obj.stages : []
  const byKey = new Map<string, Record<string, unknown>>()
  for (const s of rawStages) {
    const st = s as Record<string, unknown>
    if (typeof st.key === 'string') byKey.set(st.key, st)
  }

  const stages: PlanStage[] = STAGE_ORDER.map((meta, i) => {
    const fbStage = fb.stages[i]!
    const s = byKey.get(meta.key)
    if (!s) return fbStage
    const arr = (v: unknown, f: string[]) =>
      Array.isArray(v) && v.length ? v.map(String) : f
    const dur = Number(s.durationWeeks)
    return {
      key: meta.key,
      mesh: meta.mesh,
      title: meta.title,
      summary: typeof s.summary === 'string' && s.summary ? s.summary : fbStage.summary,
      durationWeeks: Number.isFinite(dur) && dur > 0 ? Math.round(dur) : fbStage.durationWeeks,
      estCost: typeof s.estCost === 'string' && s.estCost ? s.estCost : fbStage.estCost,
      compliance: arr(s.compliance, fbStage.compliance),
      localLaws: arr(s.localLaws, fbStage.localLaws),
      agents: arr(s.agents, fbStage.agents),
    }
  })

  const totalWeeks = Number(obj.totalWeeks)
  return {
    projectId,
    district,
    buildingType: typeof obj.buildingType === 'string' ? obj.buildingType : fb.buildingType,
    floors: Number.isFinite(Number(obj.floors)) ? Math.round(Number(obj.floors)) : fb.floors,
    totalCost: typeof obj.totalCost === 'string' ? obj.totalCost : fb.totalCost,
    totalWeeks:
      Number.isFinite(totalWeeks) && totalWeeks > 0
        ? Math.round(totalWeeks)
        : stages.reduce((s, x) => s + x.durationWeeks, 0),
    headline: typeof obj.headline === 'string' ? obj.headline : fb.headline,
    stages,
    source: 'asi:agents',
  }
}

// --- Deterministic plan (stage-safe default) --------------------------------

function deterministicPlan(
  projectId: string,
  idea: string,
  district: string | null,
): ExecutionPlan {
  const { buildingType, floors, width, depth } = parseIdea(idea)
  const area = width * depth * floors // gross m² proxy
  const costPerM2 = 2600 // CA blended $/m² proxy
  const totalCostNum = Math.round(area * costPerM2)
  const totalCost = fmtMoney(totalCostNum)
  const place = district ? district.toUpperCase() : 'this California parcel'

  const stages: PlanStage[] = [
    {
      key: 'compliance-workflow',
      mesh: 'foundation_slab',
      title: 'Pre-construction compliance',
      summary: `Clear entitlements for the ${buildingType} before breaking ground in ${place}: CEQA screening, zoning verification, and permit intake.`,
      durationWeeks: 8,
      estCost: fmtMoney(Math.round(totalCostNum * 0.05)),
      compliance: [
        'CEQA screening / exemption determination',
        'Zoning + setback verification against parcel',
        'Building permit application intake',
        'Geotechnical + survey on file',
      ],
      localLaws: ['CEQA (Pub. Res. Code §21000)', 'Local zoning ordinance', 'SB 35 / AB 130 streamlining eligibility'],
      agents: ['permit research', 'zoning/compliance', 'hazards'],
    },
    {
      key: 'foundation',
      mesh: 'foundation_slab',
      title: 'Foundation',
      summary: `Excavation, grading, and the slab/footings sized for ${floors} ${floors === 1 ? 'storey' : 'storeys'}.`,
      durationWeeks: 6,
      estCost: fmtMoney(Math.round(totalCostNum * 0.16)),
      compliance: ['Grading permit + SWPPP', 'Foundation special inspection', 'Soils report sign-off'],
      localLaws: ['CBC Ch. 18 (soils & foundations)', 'NPDES / SWPPP stormwater', 'Local grading ordinance'],
      agents: ['hazards', 'scheduling'],
    },
    {
      key: 'structure',
      mesh: 'structural_frame',
      title: 'Structure',
      summary: `Erect the primary frame and ${floors} floor ${floors === 1 ? 'plate' : 'plates'}; seismic detailing per the CBC.`,
      durationWeeks: Math.max(6, floors * 2),
      estCost: fmtMoney(Math.round(totalCostNum * 0.3)),
      compliance: ['Structural special inspection', 'Welding / rebar QA', 'Seismic detailing sign-off'],
      localLaws: ['CBC Ch. 16 (structural design)', 'ASCE 7 seismic', 'Title 24 structural'],
      agents: ['scheduling', 'zoning/compliance'],
    },
    {
      key: 'systems',
      mesh: 'mep_layer',
      title: 'Systems (MEP)',
      summary: 'Rough-in mechanical, electrical, plumbing and life-safety; Title 24 energy compliance.',
      durationWeeks: Math.max(5, floors),
      estCost: fmtMoney(Math.round(totalCostNum * 0.22)),
      compliance: ['Title 24 energy compliance', 'Fire/life-safety rough-in', 'MEP rough inspections'],
      localLaws: ['Title 24 Part 6 (energy)', 'CA Plumbing/Mechanical/Electrical Codes', 'NFPA 13 fire sprinklers'],
      agents: ['systems/MEP', 'scheduling'],
    },
    {
      key: 'envelope',
      mesh: 'envelope_facade',
      title: 'Envelope & facade',
      summary: 'Close the building: curtain wall, glazing, weatherproofing, and exterior finishes.',
      durationWeeks: Math.max(4, Math.round(floors * 0.8)),
      estCost: fmtMoney(Math.round(totalCostNum * 0.17)),
      compliance: ['Envelope / weatherproofing inspection', 'Title 24 fenestration U-factor', 'Accessibility path of travel'],
      localLaws: ['Title 24 Part 6 (fenestration)', 'CBC Ch. 14 (exterior walls)', 'CBC Ch. 11B (accessibility)'],
      agents: ['systems/MEP', 'zoning/compliance'],
    },
    {
      key: 'finish',
      mesh: 'roof_form',
      title: 'Finish & closeout',
      summary: 'Interior finishes, roof + PV, final inspections, and the certificate of occupancy.',
      durationWeeks: 6,
      estCost: fmtMoney(Math.round(totalCostNum * 0.1)),
      compliance: ['Final building inspection', 'Certificate of Occupancy', 'Title 24 PV / solar-ready'],
      localLaws: ['CBC Ch. 1 (CofO)', 'Title 24 Part 6 (PV)', 'CalGreen Part 11'],
      agents: ['permit research', 'scheduling'],
    },
  ]

  const totalWeeks = stages.reduce((s, x) => s + x.durationWeeks, 0)
  return {
    projectId,
    district,
    buildingType,
    floors,
    totalCost,
    totalWeeks,
    headline: `${cap(buildingType)} · ~${totalCost} · ~${Math.round(totalWeeks / 4.33)} months across 6 optimized stages.`,
    stages,
    source: 'deterministic',
  }
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`
  return `$${n}`
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

async function persistPlan(projectId: string, plan: ExecutionPlan): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(keys.projectPlan(projectId), JSON.stringify(plan), 'EX', 86400)
  } catch (err) {
    console.warn('[executionPlan] persist failed:', (err as Error).message)
  }
}

export async function getExecutionPlan(projectId: string): Promise<ExecutionPlan | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const raw = await redis.get(keys.projectPlan(projectId))
    return raw ? (JSON.parse(raw) as ExecutionPlan) : null
  } catch {
    return null
  }
}
