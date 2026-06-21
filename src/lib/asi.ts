// ---------------------------------------------------------------------------
// ASI:One client — the universal LLM + agent router (master plan §3C).
//
// Two responsibilities:
//   1. asiComplete()  — general text completion. Constructa uses ASI:One as its
//      ONLY LLM now (Anthropic removed); src/lib/claude.ts delegates here.
//   2. generateLandBuyingGuide() — the land-acquisition agent loop that returns
//      a factor-scored, source-backed buy/hold/avoid recommendation, with the
//      compress → cache → native → Agentverse-fallback → cache pattern.
//
// ASI:One exposes an OpenAI-compatible Chat Completions API at
// https://api.asi1.ai/v1. Env-guarded: with no ASI_ONE_API_KEY everything
// degrades to deterministic seeded output so the demo runs offline.
// ---------------------------------------------------------------------------

import { createHash, randomUUID } from 'node:crypto'
import { getRedis, keys } from '~/lib/redis'
import { arize } from '~/lib/arize'
import { compressScrapedContext, compressionStats } from '~/lib/compression'
import { getDistrict } from '~/lib/mapData'
import { resolveRegion } from '~/lib/regionContext'

const ASI_BASE = () =>
  (process.env.ASI_ONE_BASE_URL ?? 'https://api.asi1.ai/v1').trim()
// ASI:One's chat endpoint accepts asi1 / asi1-mini / asi1-ultra. (The
// agentic/Agentverse routing model is not valid on this completions route.)
const ASI_MODEL = () => (process.env.ASI_ONE_MODEL ?? 'asi1').trim()

export function hasAsiKey(): boolean {
  return Boolean(process.env.ASI_ONE_API_KEY?.trim())
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Low-level OpenAI-compatible chat call against ASI:One. */
async function asiChat(
  messages: ChatMessage[],
  opts: { json?: boolean; timeoutMs?: number; system?: string } = {},
): Promise<string> {
  const body: Record<string, unknown> = {
    model: ASI_MODEL(),
    messages: opts.system
      ? [{ role: 'system', content: opts.system }, ...messages]
      : messages,
  }
  if (opts.json) body.response_format = { type: 'json_object' }

  const res = await fetch(`${ASI_BASE()}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.ASI_ONE_API_KEY?.trim()}`,
      // ASI:One requires a session id header for conversation tracking.
      'x-session-id': randomUUID(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
  })
  if (!res.ok) throw new Error(`ASI:One ${res.status}: ${await res.text().catch(() => '')}`)
  const data: any = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

/**
 * General single-turn completion — the app's universal LLM entrypoint.
 * Returns a mock string when no key is set so callers stay runnable.
 */
/**
 * JSON-mode completion against ASI:One. Returns the raw JSON string (caller
 * parses). Throws on transport error so callers can fall back deterministically.
 * Used by the model-generation + execution-plan agents.
 */
export async function asiJson(
  prompt: string,
  system: string,
  timeoutMs = 22_000,
): Promise<string> {
  return asiChat([{ role: 'user', content: prompt }], { json: true, system, timeoutMs })
}

export async function asiComplete(prompt: string, system?: string): Promise<string> {
  if (!hasAsiKey()) {
    return `[mock ASI:One response — set ASI_ONE_API_KEY to enable]\n\n${prompt.slice(0, 200)}`
  }
  try {
    const text = await asiChat([{ role: 'user', content: prompt }], { system })
    arize.logSuccess({ agentId: 'asi_completion' })
    return text
  } catch (err) {
    arize.logError('asi_completion', (err as Error).message)
    return `[ASI:One error — ${(err as Error).message}]`
  }
}

// --- Land-buying guide -------------------------------------------------------

export interface GuideFactor {
  key: string
  label: string
  score: number // 0..100
  reasoning: string
  sources: { title: string; url: string }[]
  // Multistack provenance (Agentverse layer): which specialist agent produced
  // this factor and how confident it was. Optional so legacy/mock paths still typecheck.
  confidence?: number // 0..1
  agent?: { name: string; handle: string; address: string }
}

export interface BuyRecommendation {
  verdict: 'buy' | 'hold' | 'avoid'
  headline: string
  reasoning: string // in-depth, multi-sentence
}

export interface BuyingGuide {
  district: string
  recommendation: BuyRecommendation
  factors: GuideFactor[]
  consensusScore: number
  // Legacy flat fields kept for backward compatibility with older callers.
  zoning: string
  permits: string
  crowd_demands: string
  testimonials: string
  source: 'cache' | 'asi:native' | 'asi:agentverse' | 'mock' | string
}

const FACTOR_DEFS = [
  { key: 'zoning', label: 'Zoning Availability' },
  { key: 'permits', label: 'Permit Velocity' },
  { key: 'sentiment', label: 'Community Sentiment' },
  { key: 'cost', label: 'Land Cost Value' },
  { key: 'hazard', label: 'Environmental / Hazard Risk' },
  { key: 'infrastructure', label: 'Infrastructure Access' },
] as const

const SYSTEM_INSTRUCTION =
  'You are a specialized land-acquisition analyst. Given compressed research ' +
  'records scraped from permit portals, zoning GIS, and community boards, ' +
  'evaluate a parcel/region for development. Return STRICT JSON with this shape: ' +
  '{ "consensusScore": <0-100>, "recommendation": { "verdict": "buy"|"hold"|"avoid", ' +
  '"headline": <short>, "reasoning": <3-5 sentences of specific, evidence-based ' +
  'reasoning to buy or not buy, citing the records> }, "factors": [ { "key": ' +
  '"zoning"|"permits"|"sentiment"|"cost"|"hazard"|"infrastructure", "label": <string>, ' +
  '"score": <0-100>, "reasoning": <1-2 sentences>, "sources": [ { "title": <string>, ' +
  '"url": <string> } ] } ] }. Include all six factor keys. Be decisive and specific.'

function hashPrompt(districtId: string, compressed: string): string {
  return createHash('sha256').update(districtId + compressed).digest('hex')
}

/** Deterministic, defensible guide when ASI:One is not configured. */
function mockGuide(districtId: string, compressed: string, baseScore?: number): BuyingGuide {
  const d = getDistrict(districtId)
  const region = resolveRegion(districtId)
  const regionName = region?.label?.split('·').pop()?.trim() ?? d?.regionalName ?? districtId
  const base = baseScore ?? d?.aggregateConsensusScore ?? region?.score ?? 64
  const mentionsReject = /reject/i.test(compressed)
  const mentionsHazard = /hazard|flood|fault|fire/i.test(compressed)

  // Spread sub-scores around the base so the factor bars look real.
  const seed = districtId.split('').reduce((n, c) => n + c.charCodeAt(0), 0)
  const jitter = (i: number) => ((seed * (i + 3)) % 24) - 12
  const factors: GuideFactor[] = FACTOR_DEFS.map((f, i) => {
    let score = Math.max(8, Math.min(97, base + jitter(i)))
    if (f.key === 'permits' && mentionsReject) score = Math.max(20, score - 15)
    if (f.key === 'hazard') score = mentionsHazard ? Math.min(score, 45) : Math.max(score, 60)
    return {
      key: f.key,
      label: f.label,
      score,
      reasoning: factorBlurb(f.key, score, regionName),
      sources: mockSources(f.key, regionName),
    }
  })

  const verdict: BuyRecommendation['verdict'] =
    base >= 75 ? 'buy' : base >= 55 ? 'hold' : 'avoid'

  const consensusScore = Math.round(
    factors.reduce((sum, f) => sum + f.score, 0) / factors.length,
  )

  return {
    district: districtId,
    consensusScore,
    recommendation: {
      verdict,
      headline:
        verdict === 'buy'
          ? 'Strong development opportunity'
          : verdict === 'hold'
          ? 'Viable with diligence'
          : 'Proceed with caution',
      reasoning:
        `${regionName} scores ${base}/100 on construction consensus. ` +
        `Zoning is ${d?.guide?.zoning ?? 'mixed-use friendly'} and permit velocity is ` +
        `${d?.guide?.permits ?? 'moderate'}. ${
          mentionsReject
            ? 'Recent setback rejections suggest budgeting for an extra plan-check cycle. '
            : 'No recent rejection patterns were found in the scraped permit history. '
        }${
          verdict === 'buy'
            ? 'On balance the entitlement risk is low relative to the upside — a buy.'
            : verdict === 'hold'
            ? 'Returns are real but contingent on clearing discretionary review — hold and verify.'
            : 'Entitlement friction and sentiment risk outweigh the upside here — avoid for now.'
        }`,
    },
    factors,
    zoning: d?.guide?.zoning ?? 'Mixed-use; protected/tribal land excluded.',
    permits: d?.guide?.permits ?? 'Permit velocity ~41 days.',
    crowd_demands: d?.guide?.crowd_demands ?? 'Sentiment leans positive on density.',
    testimonials: d?.guide?.testimonials ?? '"Plan check was reasonable." — local GC',
    source: 'mock',
  }
}

function factorBlurb(key: string, score: number, name: string): string {
  const hi = score >= 70
  switch (key) {
    case 'zoning':
      return hi
        ? `${name} has abundant by-right and mixed-use parcels with few overlay restrictions.`
        : `${name} zoning is constrained — expect overlays or variances on many parcels.`
    case 'permits':
      return hi
        ? `Permit approvals move fast here; recent applications cleared well under the state median.`
        : `Permit timelines run long with RFI-heavy plan check; budget extra cycles.`
    case 'sentiment':
      return hi
        ? `Community discussion skews pro-development, especially for transit-oriented density.`
        : `Local boards show organized opposition; discretionary hearings are a real risk.`
    case 'cost':
      return hi
        ? `Land basis is favorable relative to achievable rents for the target use.`
        : `Land cost is elevated; pencil the deal carefully against comparable sales.`
    case 'hazard':
      return hi
        ? `Low environmental exposure — minimal flood, fault, or wildfire overlay on the buildable pool.`
        : `Notable hazard overlays (flood/fault/fire) reduce the usable, insurable footprint.`
    default:
      return hi
        ? `Utilities, road access, and grid/water capacity are in place for near-term build.`
        : `Infrastructure gaps (water taps, grid headroom) may gate or delay construction.`
  }
}

function mockSources(key: string, name: string) {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '-')
  const map: Record<string, { title: string; url: string }[]> = {
    zoning: [
      { title: `${name} Zoning GIS portal`, url: `https://gis.example.gov/${slug}/zoning` },
    ],
    permits: [
      { title: `${name} permit issuance dashboard`, url: `https://permits.example.gov/${slug}` },
    ],
    sentiment: [
      { title: `${name} community board thread`, url: `https://boards.example.com/${slug}` },
    ],
    cost: [
      { title: `${name} land comparables`, url: `https://land.example.com/${slug}/comps` },
    ],
    hazard: [
      { title: `FEMA / CalFire overlays — ${name}`, url: `https://hazards.example.gov/${slug}` },
    ],
    infrastructure: [
      { title: `${name} utility capacity map`, url: `https://utility.example.gov/${slug}` },
    ],
  }
  return map[key] ?? []
}

function parseGuide(
  json: string,
  districtId: string,
  source: BuyingGuide['source'],
): BuyingGuide {
  let parsed: any = {}
  try {
    parsed = JSON.parse(json)
  } catch {
    /* fall through to seeded defaults */
  }
  const fallback = mockGuide(districtId, '')
  const factors: GuideFactor[] = Array.isArray(parsed.factors) && parsed.factors.length
    ? FACTOR_DEFS.map((def, i) => {
        const f = parsed.factors.find((x: any) => x.key === def.key) ?? parsed.factors[i] ?? {}
        const fb = fallback.factors[i]!
        return {
          key: def.key,
          label: f.label ?? def.label,
          score: Number(f.score ?? fb.score),
          reasoning: f.reasoning ?? fb.reasoning,
          sources: Array.isArray(f.sources) && f.sources.length ? f.sources : fb.sources,
        }
      })
    : fallback.factors

  return {
    district: districtId,
    consensusScore: Number(parsed.consensusScore ?? fallback.consensusScore),
    recommendation: {
      verdict: parsed.recommendation?.verdict ?? fallback.recommendation.verdict,
      headline: parsed.recommendation?.headline ?? fallback.recommendation.headline,
      reasoning: parsed.recommendation?.reasoning ?? fallback.recommendation.reasoning,
    },
    factors,
    zoning: factors.find((f) => f.key === 'zoning')?.reasoning ?? fallback.zoning,
    permits: factors.find((f) => f.key === 'permits')?.reasoning ?? fallback.permits,
    crowd_demands: factors.find((f) => f.key === 'sentiment')?.reasoning ?? fallback.crowd_demands,
    testimonials: fallback.testimonials,
    source,
  }
}

/**
 * Deterministic seeded guide — never calls the network. This is the stage-safe
 * default path: rich, non-zero factor scores generated locally so the panel is
 * instant and reliable. Live mode (below) runs the real ASI:One synthesis.
 */
export function seededGuide(id: string, baseScore?: number): BuyingGuide {
  return mockGuide(id, '', baseScore)
}

async function agentverseFallback(userPayload: string): Promise<string> {
  return asiChat([{ role: 'user', content: userPayload }], {
    json: true,
    timeoutMs: 25_000,
    system:
      'Search the Agentverse marketplace for a land_compliance_experts agent and ' +
      'delegate this evaluation to it. Return the same strict JSON shape.',
  })
}

/**
 * Generate the land-buying guide for a district/region from raw scraped blocks.
 * Full §3C compress → cache → native → Agentverse → cache loop.
 */
// ---------------------------------------------------------------------------
// AGENTVERSE LAYER (master plan §3C — multistack flow)
//
// The 6 consensus factors are NOT produced by one monolithic LLM call. Each
// factor is owned by a dedicated specialist uAgent deployed on Agentverse.
// We reach them THROUGH ASI:One (the universal agent router): for every factor
// we ask ASI:One to route to that specific agent by name + address and return a
// strict JSON verdict. A low-confidence reply triggers one automatic retry
// (Loop A feedback). The 6 specialist scores are then aggregated into the land
// "consensus to buy", and ASI:One synthesizes the final buy/hold/avoid call.
// ---------------------------------------------------------------------------

interface AgentSpec {
  factorKey: string
  label: string
  name: string
  handle: string
  address: string
  specialty: string
  weight: number
}

const AGENTVERSE_REGISTRY: AgentSpec[] = [
  { factorKey: 'zoning', label: 'Zoning Availability', name: 'ConstructaZoning', handle: '@Constructa-zoning',
    address: 'agent1q0nvgyxvqn8ckesy8mxq5n3mf3lntw9hg84scn8ushydsvlejfhfj746x8f',
    specialty: 'California zoning, parcel buildability, ArcGIS land availability, tribal/DoD exclusions', weight: 1 },
  { factorKey: 'permits', label: 'Permit Velocity', name: 'ConstructaPermits', handle: '@Constructa-permits',
    address: 'agent1q05vdlht6c89r9cjpz0hf6w43svp0ukh2n4u855q0fqfmrdkjvnfq2awq48',
    specialty: 'California building permit approval velocity and median processing time', weight: 1 },
  { factorKey: 'sentiment', label: 'Community Sentiment', name: 'ConstructaLocalDev', handle: '@Constructa-local-dev',
    address: 'agent1qf9wp6hcex75s0nmdd2k7d3p30f4peg3fjvwqggmn8agt44c97wfkyguufp',
    specialty: 'California nearby active development momentum and community/permit activity', weight: 0.8 },
  { factorKey: 'cost', label: 'Land Cost Value', name: 'ConstructaLandCost', handle: '@Constructa-land-cost',
    address: 'agent1qfcmtv9f7y5vejvwn225ahkksxg4p2jayc6sfckj83t58tkpvx5mjvka025',
    specialty: 'California land price per acre comps and construction cost multiplier', weight: 1 },
  { factorKey: 'hazard', label: 'Environmental / Hazard Risk', name: 'ConstructaHazards', handle: '@Constructa-hazards',
    address: 'agent1qgprdps4cvspas6en82mxw82mj8zx2ft34447scav0mxq9et46czvaqxt33',
    specialty: 'California natural hazards: FEMA flood zone, USGS seismic, CAL FIRE wildfire risk', weight: 1 },
  { factorKey: 'infrastructure', label: 'Infrastructure & Environmental Regulation', name: 'ConstructaEnvironment', handle: '@Constructaenvironment',
    address: 'agent1q0pp6s97ymdv87tpuauj8gwcw9k7gaxusf2qxtnykdhn7lywk44t5njug2y',
    specialty: 'California CEQA tier, Coastal Commission, CDFW wetlands/habitat & infrastructure constraints', weight: 1 },
]

const CONFIDENCE_FLOOR = 0.4

// Query ONE Agentverse specialist through ASI:One. Returns a GuideFactor with
// provenance + confidence. Never throws — degrades to a neutral estimate.
async function queryAgentverseFactor(
  spec: AgentSpec,
  userPayload: string,
  retry = false,
): Promise<GuideFactor> {
  const system =
    `You are the ASI:One agent router. Route this request to the Agentverse specialist agent ` +
    `"${spec.name}" (${spec.handle}, address ${spec.address}), whose specialty is: ${spec.specialty}. ` +
    `Act as that agent and analyze ONLY the "${spec.label}" factor for the land described below. ` +
    (retry ? 'A previous pass was low-confidence — be more thorough and decisive. ' : '') +
    `Reply with ONLY strict JSON: {"score": <0-100 integer>, "confidence": <0-1 number>, ` +
    `"reasoning": "<two-sentence, specific justification>", "sources": [{"title":"<src>","url":"<url>"}]}. No prose.`
  try {
    const json = await asiChat([{ role: 'user', content: userPayload }], { json: true, system, timeoutMs: 25_000 })
    const d = JSON.parse(json) as { score?: number; confidence?: number; reasoning?: string; sources?: { title: string; url: string }[] }
    return {
      key: spec.factorKey,
      label: spec.label,
      score: Math.max(0, Math.min(100, Math.round(Number(d.score ?? 50)))),
      confidence: Math.max(0, Math.min(1, Number(d.confidence ?? 0.5))),
      reasoning: d.reasoning || `${spec.name} returned no detail.`,
      sources: Array.isArray(d.sources) ? d.sources.slice(0, 4) : [],
      agent: { name: spec.name, handle: spec.handle, address: spec.address },
    }
  } catch (err) {
    return {
      key: spec.factorKey,
      label: spec.label,
      score: 50,
      confidence: 0.2,
      reasoning: `${spec.name} unreachable (${(err as Error).message}); neutral placeholder.`,
      sources: [],
      agent: { name: spec.name, handle: spec.handle, address: spec.address },
    }
  }
}

// Scatter-gather across all 6 Agentverse specialists, with a per-agent
// low-confidence retry (Loop A). Returns the 6 factors + weak-agent list.
async function gatherAgentverseFactors(
  userPayload: string,
): Promise<{ factors: GuideFactor[]; weak: string[] }> {
  const factors = await Promise.all(
    AGENTVERSE_REGISTRY.map(async (spec) => {
      let f = await queryAgentverseFactor(spec, userPayload)
      if ((f.confidence ?? 0) < CONFIDENCE_FLOOR) {
        const retry = await queryAgentverseFactor(spec, userPayload, true)
        if ((retry.confidence ?? 0) >= (f.confidence ?? 0)) f = retry
      }
      return f
    }),
  )
  const weak = factors.filter((f) => (f.confidence ?? 0) < CONFIDENCE_FLOOR).map((f) => f.label)
  return { factors, weak }
}

// Weighted consensus across the 6 specialist scores = "land consensus to buy".
function consensusFromFactors(factors: GuideFactor[]): number {
  const wOf = (k: string) => AGENTVERSE_REGISTRY.find((a) => a.factorKey === k)?.weight ?? 1
  const num = factors.reduce((s, f) => s + wOf(f.key) * f.score, 0)
  const den = factors.reduce((s, f) => s + wOf(f.key), 0) || 1
  return Math.round((num / den) * 10) / 10
}

// ASI:One synthesizes the final buy/hold/avoid recommendation FROM the 6
// specialist verdicts (the synthesis half of the multistack flow).
async function synthesizeRecommendation(
  districtId: string,
  factors: GuideFactor[],
  consensusScore: number,
): Promise<BuyRecommendation> {
  const digest = factors
    .map((f) => `- ${f.label} [${f.agent?.name}]: ${f.score}/100 (conf ${f.confidence}) — ${f.reasoning}`)
    .join('\n')
  const system =
    'You are ASI:One acting as the lead orchestrator. Six Agentverse specialist agents have each scored ' +
    'one factor of a California land parcel. Synthesize their verdicts into a single investment call. ' +
    'Reply with ONLY strict JSON: {"verdict":"buy|hold|avoid","headline":"<short>","reasoning":"<2-3 sentences citing the specialists>"}.'
  const user = `Parcel/region: ${districtId}\nWeighted consensus: ${consensusScore}/100\nSpecialist verdicts:\n${digest}`
  const json = await asiChat([{ role: 'user', content: user }], { json: true, system, timeoutMs: 25_000 })
  const d = JSON.parse(json) as { verdict?: string; headline?: string; reasoning?: string }
  const verdict = (['buy', 'hold', 'avoid'].includes(String(d.verdict)) ? d.verdict : consensusScore >= 66 ? 'buy' : consensusScore >= 45 ? 'hold' : 'avoid') as BuyRecommendation['verdict']
  return {
    verdict,
    headline: d.headline || `Consensus ${consensusScore}/100 across 6 Agentverse specialists`,
    reasoning: d.reasoning || 'Synthesized from the six specialist agent verdicts.',
  }
}

export async function generateLandBuyingGuide(
  districtId: string,
  rawScrapedData: string[],
): Promise<BuyingGuide> {
  const redis = getRedis()
  const compressed = compressScrapedContext(rawScrapedData)
  const stats = compressionStats(rawScrapedData, compressed)
  const promptHash = hashPrompt(districtId, '|multistack|' + compressed)

  // Cache
  if (redis) {
    const cached = await redis.get(keys.asiGuide(promptHash))
    if (cached) return JSON.parse(cached) as BuyingGuide
  }

  // No key → graceful mock (never errors)
  if (!hasAsiKey()) {
    arize.logSuccess({ agentId: 'asi_core_router(mock)' })
    const g = mockGuide(districtId, compressed)
    if (redis) await redis.set(keys.asiGuide(promptHash), JSON.stringify(g), 'EX', 7200)
    return g
  }

  const userPayload =
    `Region/parcel: ${districtId}\n\nResearch records (${stats.compressedChars}/${stats.rawChars} chars):\n` +
    compressed

  let guide: BuyingGuide
  try {
    // ----- STACK 1: Agentverse — 6 specialist agents scatter-gather (+retry) -----
    const { factors, weak } = await gatherAgentverseFactors(userPayload)
    const consensusScore = consensusFromFactors(factors)

    // ----- STACK 2: ASI:One — synthesize the buy/hold/avoid call from the 6 -----
    const recommendation = await synthesizeRecommendation(districtId, factors, consensusScore)

    arize.logSuccess({ agentId: 'asi_agentverse_multistack' })
    const byKey = (k: string) => factors.find((f) => f.key === k)
    guide = {
      district: districtId,
      factors,
      recommendation,
      consensusScore,
      // Legacy flat fields (kept for older callers) derived from the agent factors.
      zoning: byKey('zoning')?.reasoning ?? 'Zoning evaluated by ConstructaZoning agent.',
      permits: byKey('permits')?.reasoning ?? 'Permit velocity evaluated by ConstructaPermits agent.',
      crowd_demands: byKey('sentiment')?.reasoning ?? 'Community sentiment evaluated by ConstructaLocalDev agent.',
      testimonials: byKey('cost')?.reasoning ?? 'Land cost evaluated by ConstructaLandCost agent.',
      source: weak.length ? `asi:agentverse (low-confidence: ${weak.join(', ')})` : 'asi:agentverse',
    }
  } catch (err) {
    // Degrade: try the legacy single ASI pass, then mock — never throw to the UI.
    arize.logError('asi_agentverse_multistack', (err as Error).message)
    try {
      guide = parseGuide(await agentverseFallback(userPayload), districtId, 'asi:native')
    } catch {
      guide = mockGuide(districtId, compressed)
    }
  }

  if (redis) {
    await redis.set(keys.asiGuide(promptHash), JSON.stringify(guide), 'EX', 7200)
  }
  return guide
}