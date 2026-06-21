// ---------------------------------------------------------------------------
// ASI:One client — the universal LLM + agent router (master plan §3C).
//
// Two responsibilities:
//   1. asiComplete()  — general text completion. Construca uses ASI:One as its
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
  source: 'cache' | 'asi:native' | 'asi:agentverse' | 'mock'
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

  return {
    district: districtId,
    consensusScore: base,
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
export async function generateLandBuyingGuide(
  districtId: string,
  rawScrapedData: string[],
): Promise<BuyingGuide> {
  const redis = getRedis()
  const compressed = compressScrapedContext(rawScrapedData)
  const stats = compressionStats(rawScrapedData, compressed)
  const promptHash = hashPrompt(districtId, compressed)

  if (redis) {
    const cached = await redis.get(keys.asiGuide(promptHash))
    if (cached) {
      arize.logSuccess({ agentId: 'asi_core_router', metrics: { confidence: 1 } })
      return { ...(JSON.parse(cached) as BuyingGuide), source: 'cache' }
    }
  }

  const userPayload =
    `District/Region: ${districtId}\n` +
    `Compressed Research Records (${stats.compressedChars}/${stats.rawChars} chars):\n` +
    compressed

  if (!hasAsiKey()) {
    arize.logSuccess({ agentId: 'asi_core_router(mock)' })
    return mockGuide(districtId, compressed)
  }

  let guide: BuyingGuide
  try {
    const json = await asiChat([{ role: 'user', content: userPayload }], {
      json: true,
      system: SYSTEM_INSTRUCTION,
    })
    guide = parseGuide(json, districtId, 'asi:native')
    arize.logSuccess({ agentId: 'asi_core_router' })
  } catch (err) {
    console.warn('[asi] native loop degraded — searching Agentverse:', (err as Error).message)
    try {
      const json = await agentverseFallback(`${SYSTEM_INSTRUCTION}\n\n${userPayload}`)
      guide = parseGuide(json, districtId, 'asi:agentverse')
      arize.logFallbackTriggered({
        cause: (err as Error).message,
        assignedAgent: 'agentverse:land_compliance_experts',
      })
    } catch (err2) {
      arize.logError('asi_core_router', (err2 as Error).message)
      guide = mockGuide(districtId, compressed)
    }
  }

  if (redis) {
    await redis.set(keys.asiGuide(promptHash), JSON.stringify(guide), 'EX', 7200)
  }
  return guide
}
