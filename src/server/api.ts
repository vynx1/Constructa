



﻿import { Hono } from 'hono'
import { getRedis, keys } from '~/lib/redis'
import { formatForCompliance } from '~/lib/compliance'
import { renderComplianceDoc } from '~/lib/compliancePdf'
import { complete } from '~/lib/claude'
import { scrapeLocalPartners, mockPartners , type BusinessPartner } from '~/lib/partnerScraper'
import {
  STATE_SCORES,
  getDistrict,
  districtsForState,
} from '~/lib/mapData'
import {
  generateStateCells,
  generateStateRegions,
  generateScoredDistricts,
  findDistrictById,
  hasStateMeta,
} from '~/lib/mapGeo'
import {
  congressionalDistrictsForState,
  countiesForState,
  districtCentroid,
} from '~/lib/cdBoundaries'
import {
  executeBrowserbaseScrapePipeline,
  scrapeLandListings,
} from '~/lib/browserbase'
import { generateLandBuyingGuide, seededGuide, asiComplete } from '~/lib/asi'
import { generateModel, getModel } from '~/lib/modelGen'
import { generateExecutionPlan, getExecutionPlan } from '~/lib/executionPlan'
import {
  readProjectData,
  patchProjectData,
  addProblem,
  addSolvedCompliance,
  addDailyLog,
  groundingContext,
} from '~/lib/projectData'


// ---------------------------------------------------------------------------
// Web API (Hono), mounted inside TanStack Start via `src/routes/api/$.ts`.
// Owns map reads, project CRUD, Claude calls, and the 10-step state machine.
// Every route maps to a page flow or one of the 3 agents (BUILD_PLAN Â§6).
//
// Handlers are intentionally thin stubs returning mock/cached shapes so the
// frontend is fully runnable today. Real Redis/Claude/agent wiring drops in
// behind the same response contracts.
// ---------------------------------------------------------------------------

const AGENT_SERVICE_URL = () =>
  process.env.AGENT_SERVICE_URL ?? 'http://localhost:8000'

export const api = new Hono().basePath('/api')

api.get('/health', (c) => c.json({ ok: true, service: 'Constructa-web-api' }))

// --- Map (read-only, cache-backed) -----------------------------------------
// Implements the interactive-map data plane (master plan Â§1 phases 1â€“2 + Â§3A).
// All reads serve from Redis when present, else from the seeded mock cache, so
// the map renders identically with or without infrastructure.
// In-memory fallback for the local-partners rotation window when Redis is
// unavailable. Holds the last 5 distinct districts' shown partner keys so the
// same business is not shown again until the user clicks through 5 more
// different districts.
type PartnerWindowEntry = { regionId: string; keys: string[] }
let partnersWindowMem: PartnerWindowEntry[] = []

const map = new Hono()

// Phase 1 â€” Regional Heatmap. National state-level aggregate scores.
// Redis key: map:state:{code}
map.get('/states', async (c) => {
  const redis = getRedis()
  const states = await Promise.all(
    Object.values(STATE_SCORES).map(async (s) => {
      if (redis) {
        const h = await redis.hgetall(keys.mapState(s.code))
        if (h && h.aggregate_score) {
          return {
            code: s.code,
            name: s.name,
            aggregateScore: Number(h.aggregate_score),
            regulatoryDensity: Number(h.regulatory_density ?? s.regulatoryDensity),
            districts: s.districts,
          }
        }
      }
      return s
    }),
  )
  return c.json({ source: redis ? 'redis|seed' : 'seed', states })
})

// Phase 2 â€” District Focus. Drill into a state's metro-district groupings.
map.get('/state/:code/districts', (c) => {
  const code = c.req.param('code')
  return c.json({ state: code, districts: districtsForState(code) })
})

// District-level detail (center, regional name, consensus score, cities).
// Redis key: map:district:{id}
map.get('/district/:id', async (c) => {
  const id = c.req.param('id')
  const redis = getRedis()
  if (redis) {
    const raw = await redis.get(keys.mapDistrict(id))
    if (raw) return c.json({ source: 'redis', ...JSON.parse(raw) })
  }
  const d = getDistrict(id)
  if (!d) return c.json({ error: 'unknown district', id }, 404)
  const { grids, properties, guide, ...meta } = d
  void grids
  void properties
  void guide
  return c.json({ source: 'seed', ...meta })
})

// District micro-grid cells for the spatial-smoothing heatmap.
// Redis key: map:district:{id}:grids
map.get('/district/:id/grids', async (c) => {
  const id = c.req.param('id')
  const redis = getRedis()
  if (redis) {
    const raw = await redis.get(keys.mapDistrictGrids(id))
    if (raw) return c.json({ source: 'redis', id, grids: JSON.parse(raw) })
  }
  const d = getDistrict(id)
  return c.json({ source: 'seed', id, grids: d?.grids ?? [] })
})

// Phase 3 + 4 â€” Automated Deep-Dive + Agent Consensus Summary.
// Stage-Safe Mock Bridge (master plan Â§4): the `x-live-mode` header gates the
// live Browserbase + ASI:One pass. Default (off) serves the frozen guide so a
// presentation never stalls; any live failure degrades back to the same cache.
map.post('/district/:id/deep-dive', async (c) => {
  const id = c.req.param('id')
  const d = getDistrict(id)
  if (!d) return c.json({ error: 'unknown district', id }, 404)

  const projectType =
    (await c.req.json().catch(() => ({}))).projectType ?? 'mixed_use'
  const liveMode = c.req.header('x-live-mode') === 'true'
  const redis = getRedis()

  // Instant presentation path â€” frozen, pre-generated record.
  const frozen = async () => {
    if (redis) {
      const pre = await redis.get(keys.preGeneratedGuide(id))
      if (pre) return JSON.parse(pre)
    }
    return {
      district: id,
      guide: { district: id, ...d.guide, consensusScore: d.aggregateConsensusScore, source: 'mock' },
      properties: d.properties,
      live: false,
    }
  }

  if (!liveMode) return c.json(await frozen())

  // Live execution path â€” real Browserbase gather + ASI:One evaluation.
  try {
    const scrape = await executeBrowserbaseScrapePipeline(id, projectType)
    if (redis) {
      // Persist raw scrapes for the session (master plan Â§3A).
      await redis.del(keys.sessionRawScrapes(id))
      if (scrape.blocks.length)
        await redis.rpush(keys.sessionRawScrapes(id), ...scrape.blocks)
    }
    const guide = await generateLandBuyingGuide(id, scrape.blocks)
    return c.json({
      district: id,
      guide,
      properties: d.properties,
      live: scrape.live,
    })
  } catch (err) {
    console.error('[deep-dive] live pass failed, serving frozen:', err)
    return c.json(await frozen())
  }
})

// --- Granular zip-level heatmap (ask #2) ------------------------------------
// Serves a dense cell grid for a state. Reads Redis first (map:state:{code}:cells)
// so once real data is loaded the heatmap fills at high granularity; otherwise
// generates the seeded grid. The frontend clips cells to the state outline.
map.get('/state/:code/heatmap', async (c) => {
  const code = c.req.param('code').toUpperCase()
  const redis = getRedis()
  if (redis) {
    const raw = await redis.get(keys.mapStateCells(code))
    if (raw) return c.json({ source: 'redis', code, cells: JSON.parse(raw) })
  }
  if (!hasStateMeta(code)) return c.json({ source: 'none', code, cells: [] })
  return c.json({ source: 'seed', code, cells: generateStateCells(code) })
})

// --- Congressional districts with real boundaries + per-district scores --------
map.get('/state/:code/congressional-districts', async (c) => {
  const code = c.req.param('code').toUpperCase()
  try {
    const fc = await congressionalDistrictsForState(code)
    const numbers = fc.features.map((f) => f.properties.number)
    const stateScore = STATE_SCORES[code]?.aggregateScore
    const districts = generateScoredDistricts(code, numbers, stateScore)
    const scoreById = Object.fromEntries(districts.map((d) => [d.id, d.score]))

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: fc.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          score: scoreById[f.properties.id] ?? 50,
        },
      })),
    }

    const enriched = districts.map((d) => {
      const feat = fc.features.find((f) => f.properties.id === d.id)
      return {
        ...d,
        center: feat ? districtCentroid(feat.geometry) : d.center,
      }
    })

    return c.json({ source: 'us-atlas', code, districts: enriched, geojson })
  } catch (err) {
    console.error('[map] congressional districts failed:', err)
    return c.json({ source: 'error', code, districts: [], geojson: { type: 'FeatureCollection', features: [] } })
  }
})

// --- County boundary lines for state overlay ---------------------------------
map.get('/state/:code/counties', async (c) => {
  const code = c.req.param('code').toUpperCase()
  try {
    const geojson = await countiesForState(code)
    return c.json({ source: 'us-atlas', code, geojson })
  } catch (err) {
    console.error('[map] counties failed:', err)
    return c.json({ source: 'error', code, geojson: { type: 'FeatureCollection', features: [] } })
  }
})

// --- Congressional regions for a state (legacy strip fallback) --------------
map.get('/state/:code/regions', async (c) => {
  const code = c.req.param('code').toUpperCase()
  const redis = getRedis()
  if (redis) {
    const raw = await redis.get(keys.mapStateRegions(code))
    if (raw) return c.json({ source: 'redis', code, regions: JSON.parse(raw) })
  }
  return c.json({ source: 'seed', code, regions: generateStateRegions(code) })
})

// --- Region deep-dive: land listings + factor-scored buying guide -----------
// Stage-safe: `x-live-mode: true` runs the live Browserbase + ASI:One pass;
// otherwise (and on any failure) it serves the seeded/cached record.
map.post('/region/:regionId/deep-dive', async (c) => {
  const regionId = c.req.param('regionId')
  const region =
    findDistrictById(regionId) ??
    (() => {
      const code = regionId.split('-r')[0] ?? ''
      return generateStateRegions(code).find((r) => r.id === regionId) ?? null
    })()
  if (!region) return c.json({ error: 'unknown region', regionId }, 404)

  const liveMode = c.req.header('x-live-mode') === 'true'
  const redis = getRedis()

  // Stage-safe default: instant, deterministic, network-free seeded guide.
  const frozen = async () => {
    if (redis) {
      const pre = await redis.get(keys.preGeneratedGuide(regionId))
      if (pre) return JSON.parse(pre)
    }
    const { listings } = await scrapeLandListings(regionId)
    return {
      regionId,
      region,
      guide: seededGuide(regionId, region.score),
      listings,
      live: false,
    }
  }

  if (!liveMode) return c.json(await frozen())

  try {
    // 1. Concrete land parcels for this region's zips.
    const { listings, live: listLive } = await scrapeLandListings(regionId)
    if (redis)
      await redis.set(keys.regionListings(regionId), JSON.stringify(listings), 'EX', 7200)

    // 2. Permit/zoning/sentiment scrape â†’ compressed â†’ ASI factor guide.
    const scrape = await executeBrowserbaseScrapePipeline(regionId, 'mixed_use')
    if (redis && scrape.blocks.length) {
      await redis.del(keys.sessionRawScrapes(regionId))
      await redis.rpush(keys.sessionRawScrapes(regionId), ...scrape.blocks)
    }
    const guide = await generateLandBuyingGuide(regionId, scrape.blocks)
    return c.json({ regionId, region, guide, listings, live: listLive || scrape.live })
  } catch (err) {
    console.error('[region deep-dive] live failed, serving frozen:', err)
    return c.json(await frozen())
  }
})

// --- Liked plots (ask #5: save to Redis) ------------------------------------
map.get('/liked', async (c) => {
  const redis = getRedis()
  if (!redis) return c.json({ liked: [], source: 'memory' })
  const all = await redis.hgetall(keys.likedPlots())
  return c.json({
    liked: Object.values(all).map((v) => JSON.parse(v)),
    source: 'redis',
  })
})

map.post('/liked', async (c) => {
  const listing = await c.req.json().catch(() => null)
  if (!listing?.id) return c.json({ error: 'listing.id required' }, 400)
  const redis = getRedis()
  if (redis)
    await redis.hset(keys.likedPlots(), listing.id, JSON.stringify(listing))
  return c.json({ ok: true, id: listing.id, saved: Boolean(redis) })
})

map.delete('/liked/:id', async (c) => {
  const id = c.req.param('id')
  const redis = getRedis()
  if (redis) await redis.hdel(keys.likedPlots(), id)
  return c.json({ ok: true, id, removed: Boolean(redis) })
})

// Bonus live action: re-score a district on stage (BUILD_PLAN Â§4 "refresh").
map.post('/district/:id/refresh', async (c) => {
  const id = c.req.param('id')
  const d = getDistrict(id)
  if (!d) return c.json({ error: 'unknown district', id }, 404)
  const scrape = await executeBrowserbaseScrapePipeline(id, 'mixed_use')
  const guide = await generateLandBuyingGuide(id, scrape.blocks)
  return c.json({ id, guide, live: scrape.live })
})

map.get('/county/:fips', async (c) => {
  const fips = c.req.param('fips')
  const redis = getRedis()
  if (redis) {
    const cached = await redis.get(keys.mapCounty(fips))
    if (cached) return c.json(JSON.parse(cached))
  }
  return c.json({
    fips,
    source: 'mock',
    layers: { zoning: [], permits: [], landCost: [], sentiment: [] },
  })
})

map.get('/datacenter', (c) =>
  c.json({
    source: 'mock',
    layers: { substations: [], gridHeadroom: [], waterStress: [] },
    compliance: ['CEQA', 'Generator air permits', 'Cooling noise ordinances'],
  }),
)

// --- Local Partners: BrowserBase contractor/business + reviews scrape --------
// Cursor-paginated (page size 8). `x-live-mode: true` runs the live BrowserBase
// scrape (one session, all trades), caches the full list in Redis (2h), then
// serves pages from cache. Default/non-live and any failure serve mock so the
// vertical infinite-scroll list always renders.
map.get('/region/:regionId/partners', async (c) => {
  const regionId = c.req.param('regionId')
  const cursor = Math.max(0, parseInt(c.req.query('cursor') ?? '0', 10) || 0)
  const pageSize = 8
  const DISTRICT_BATCH = 8 // partners "claimed" per district
  const WINDOW_SIZE = 5 // rotate: no repeat until 5 different districts later
  const liveMode = c.req.header('x-live-mode') === 'true'
  const refresh =
    c.req.query('refresh') === 'true' || c.req.header('x-refresh') === 'true'
  const redis = getRedis()

  // Stable identity for a partner across districts: normalized name + host.
  const normKey = (p: BusinessPartner) =>
    `${(p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${(
      p.sourceSite || ''
    ).toLowerCase()}`

  // --- Rotation window state (Redis-backed, in-memory fallback) -------------
  const readWindow = async (): Promise<PartnerWindowEntry[]> => {
    if (redis) {
      try {
        const raw = await redis.get(keys.partnersWindow())
        if (raw) return JSON.parse(raw) as PartnerWindowEntry[]
      } catch (err) {
        console.warn('[partners] window read failed:', err)
      }
    }
    return partnersWindowMem
  }
  const writeWindow = async (w: PartnerWindowEntry[]): Promise<void> => {
    partnersWindowMem = w
    if (redis) {
      try {
        await redis.set(keys.partnersWindow(), JSON.stringify(w), 'EX', 86400)
      } catch (err) {
        console.warn('[partners] window write failed:', err)
      }
    }
  }

  const cacheKey = keys.regionPartners(regionId)

  // --- 1. Resolve the full source list for this district -------------------
  let all: BusinessPartner[] | null = null
  let live = false

  if (!refresh && redis) {
    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached) as BusinessPartner[]
        if (Array.isArray(parsed) && parsed.length) {
          all = parsed
          live = true
        }
      }
    } catch (err) {
      console.warn('[partners] cache read failed:', err)
    }
  }

  if (!all) {
    if (!liveMode) {
      all = mockPartners(regionId)
      live = false
    } else {
      try {
        const res = await scrapeLocalPartners(regionId)
        if (res.live && res.partners.length) {
          all = res.partners
          live = true
          try {
            if (redis) await redis.set(cacheKey, JSON.stringify(all), 'EX', 7200)
          } catch (err) {
            console.warn('[partners] cache write failed:', err)
          }
        } else {
          all = res.partners.length ? res.partners : mockPartners(regionId)
          live = false
        }
      } catch (err) {
        console.error('[partners] live failed, serving mock:', err)
        all = mockPartners(regionId)
        live = false
      }
    }
  }

  // --- 2. Apply the 5-district rotation window -----------------------------
  const windowState = await readWindow()
  const blocked = new Set<string>()
  for (const entry of windowState) {
    if (entry.regionId !== regionId) for (const k of entry.keys) blocked.add(k)
  }
  let rotated = all.filter((p) => !blocked.has(normKey(p)))
  // Never return an empty list — if everything is blocked, fall back to the
  // full set (the pool is smaller than 5 districts' worth of partners).
  if (rotated.length === 0) rotated = all

  const districtBatch = rotated.slice(0, DISTRICT_BATCH)

  // --- 3. Record this district into the rotation window (first page only) ---
  if (cursor === 0) {
    const nextWindow: PartnerWindowEntry[] = [
      { regionId, keys: districtBatch.map(normKey) },
      ...windowState.filter((e) => e.regionId !== regionId),
    ].slice(0, WINDOW_SIZE)
    await writeWindow(nextWindow)
  }

  // --- 4. Paginate within this district's batch ----------------------------
  const slice = districtBatch.slice(cursor, cursor + pageSize)
  const nextCursor = cursor + pageSize < districtBatch.length ? cursor + pageSize : null
  return c.json({ partners: slice, nextCursor, total: districtBatch.length, live })
})

api.route('/map', map)

// --- Project + the live build sequence -------------------------------------
const project = new Hono()

project.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    idea?: string
    description?: string
    district?: string
    partners?: string[]
  }
  const id = crypto.randomUUID()
  const redis = getRedis()
  const idea = body.idea ?? body.description ?? ''
  const district = body.district ?? null
  const record = { id, status: 'created', idea, district, ...body }
  if (redis) await redis.set(keys.project(id), JSON.stringify(record))
  // Seed the central project-data document the agents read from (spec §4).
  await patchProjectData(id, {
    idea,
    district,
    partners: Array.isArray(body.partners) ? body.partners : [],
  })
  return c.json(record, 201)
})

project.get('/:id', async (c) => {
  const id = c.req.param('id')
  const redis = getRedis()
  if (redis) {
    const raw = await redis.get(keys.project(id))
    if (raw) return c.json(JSON.parse(raw))
  }
  return c.json({ id, status: 'mock' })
})

project.post('/:id/redesign', async (c) => {
  const id = c.req.param('id')
  const text = await complete(
    `Produce a structured construction redesign plan for project ${id}.`,
    'You are Constructa, an AI construction foreman.',
  )
  return c.json({ id, redesign: text })
})

project.get('/:id/sequence', (c) => {
  const id = c.req.param('id')
  // Pre-generated 10-step sequence (served from cache in production).
  const steps = Array.from({ length: 10 }, (_, i) => ({
    step: i + 1,
    work: `Step ${i + 1} construction work (stub)`,
    compliance: [] as string[],
  }))
  return c.json({ id, steps })
})

project.post('/:id/sequence/advance', async (c) => {
  const id = c.req.param('id')
  const redis = getRedis()
  let next = 1
  if (redis) {
    next = await redis.incr(keys.projectCurrentStep(id))
  }
  return c.json({ id, step: next, watchdogFlags: [] })
})

// --- Generative 3D model (spec §1) -----------------------------------------
// POST the idea + parcel context -> ASI:One returns a component registry ->
// normalized to the mandatory group names -> cached. The model-edit agent
// button calls this same route with a modified idea to regenerate in place.
project.post('/:id/generate-model', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as {
    idea?: string
    context?: string
    district?: string
  }
  const data = await readProjectData(id)
  const idea = body.idea?.trim() || data.idea || 'a two-story mixed-use building'
  const context = body.context ?? (data.district ? `District ${data.district}` : undefined)
  const scene = await generateModel(id, idea, context)
  // Keep central data in sync so agents know the current idea + type.
  await patchProjectData(id, {
    idea,
    buildingType: scene.buildingType,
    district: body.district ?? data.district,
  })
  return c.json({ id, model: scene })
})

project.get('/:id/model', async (c) => {
  const id = c.req.param('id')
  const model = await getModel(id)
  if (!model) return c.json({ id, model: null }, 404)
  return c.json({ id, model })
})

// --- Universal execution plan + optimization timeline (spec §3) ------------
// ASI:One delegates the 6 specialist agents to produce one staged plan:
// estimated costs, time-to-completion, compliance workflow + timeline, local
// laws, and CORE compliance work — keyed to the model's mesh groups.
project.post('/:id/execution-plan', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as {
    idea?: string
    district?: string
    context?: string
  }
  const data = await readProjectData(id)
  const idea = body.idea?.trim() || data.idea || 'a two-story mixed-use building'
  const district = body.district ?? data.district
  const plan = await generateExecutionPlan(id, idea, district, body.context)
  return c.json({ id, plan })
})

project.get('/:id/plan', async (c) => {
  const id = c.req.param('id')
  const plan = await getExecutionPlan(id)
  if (!plan) return c.json({ id, plan: null }, 404)
  return c.json({ id, plan })
})

// --- Central project data the agents read from (spec §4) -------------------
project.get('/:id/data', async (c) => {
  const id = c.req.param('id')
  return c.json(await readProjectData(id))
})

project.patch('/:id/data', async (c) => {
  const id = c.req.param('id')
  const patch = await c.req.json().catch(() => ({}))
  return c.json(await patchProjectData(id, patch))
})

api.route('/project', project)

// --- Agents (the 6 workspace buttons) --------------------------------------
// Each button is a grounded ASI:One call: it reads the project's central data
// (spec §4) for context, then answers in-role. RFI/compliance/permit/hazards
// follow the same shape; daily-briefing structures a (possibly voice) update;
// model-edit is handled by /api/project/:id/generate-model.
const agents = new Hono()

// Generic grounded agent runner: project data -> ASI:One in-role -> answer.
// Never dead-ends: if ASI:One errors / times out / is keyless, the agent's
// deterministic fallback answer is served instead of a raw error string.
async function runGroundedAgent(
  projectId: string,
  role: string,
  system: string,
  question: string,
  fallback: string,
): Promise<{ answer: string; grounding: string }> {
  const data = await readProjectData(projectId)
  const grounding = groundingContext(data)
  const prompt =
    `Project context:\n${grounding || '(new project, no prior context)'}\n\n` +
    `${role} request: ${question}`
  let answer = await asiComplete(prompt, system)
  if (!answer || answer.startsWith('[ASI:One error') || answer.startsWith('[mock')) {
    answer = fallback
  }
  return { answer, grounding }
}

// Daily briefing / Log daily work: transcript (text or Deepgram) -> daily log.
agents.post('/daily-briefing', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    projectId?: string
    transcript?: string
    stage?: string
  }
  const projectId = body.projectId ?? 'demo'
  const transcript = body.transcript ?? ''
  const { answer } = await runGroundedAgent(
    projectId,
    'Daily briefing',
    'You are Constructa\'s daily-briefing agent. Turn a foreman\'s site update into a ' +
      'concise structured daily log: crew, weather, work completed, deliveries, and any ' +
      'issues/blockers. If an issue implies a compliance or schedule risk, name it.',
    `Site update for stage "${body.stage ?? 'general'}": ${transcript}`,
    transcript
      ? `Daily log — stage ${body.stage ?? 'general'}\n• Update: ${transcript}\n• Crew / weather / deliveries: not specified\n• Flagged issues: none noted. Re-run when ASI:One is reachable for a fully structured log.`
      : 'No site update was captured. Speak or type a 30–60s update and run again.',
  )
  // Persist the structured log to the project record (completed-work bank).
  if (transcript.trim())
    await addDailyLog(projectId, body.stage ?? 'general', answer).catch(() => {})
  return c.json({ projectId, log: { summary: answer, transcript } })
})

// RFI resolution: question -> cited draft answer, grounded in project data.
agents.post('/rfi', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    question?: string
    projectId?: string
  }
  const projectId = body.projectId ?? 'demo'
  const question = body.question ?? ''
  const { answer } = await runGroundedAgent(
    projectId,
    'RFI',
    'You are Constructa\'s RFI-resolution agent. Draft a clear, cited answer to a ' +
      'construction RFI grounded in California building codes. Be specific and reference ' +
      'the applicable code section where possible.',
    question,
    `RFI logged: "${question}". Draft response pending — the applicable references are the California Building Code (Title 24 Part 2) and the local amendments for this jurisdiction. This RFI has been recorded to the project so the team can resolve it once ASI:One is reachable.`,
  )
  // An RFI often surfaces an open problem — record it for the agents.
  if (question.trim()) await addProblem(projectId, 'rfi', question.trim()).catch(() => {})
  return c.json({ projectId, question, answer, citations: [] })
})

// Compliance workflows: the CORE compliance work needed for a stage.
agents.post('/compliance', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    projectId?: string
    stage?: string
    question?: string
  }
  const projectId = body.projectId ?? 'demo'
  const stage = body.stage ?? 'pre-construction'
  const { answer } = await runGroundedAgent(
    projectId,
    'Compliance',
    'You are Constructa\'s compliance agent for heavily-regulated California construction. ' +
      'Explain the CORE compliance workflow for the given stage: what to file, with whom, ' +
      'in what order, and the common rejection reasons. Cite CEQA / Title 24 / CBC where relevant.',
    body.question ?? `What compliance workflow do I need for the "${stage}" stage?`,
    `Core compliance for the "${stage}" stage in California: (1) confirm CEQA status (exemption vs. review), (2) verify zoning + setbacks against the parcel, (3) file the building permit application with stamped plans, (4) schedule the required special inspections. Common rejections: incomplete Title 24 forms and missing geotechnical sign-off. Re-run when ASI:One is reachable for a parcel-specific workflow.`,
  )
  return c.json({ projectId, stage, answer })
})

// Permit research: exemption eligibility for the project.
agents.post('/permit-research', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    projectId?: string
    question?: string
  }
  const projectId = body.projectId ?? 'demo'
  const { answer } = await runGroundedAgent(
    projectId,
    'Permit research',
    'You are Constructa\'s permit + exemption research agent. Assess which California ' +
      'streamlining / exemption pathways the project may qualify for (CEQA exemptions, ' +
      'SB 35, AB 130, density bonus) and what evidence each requires.',
    body.question ?? 'Which permit and exemption pathways could this project use?',
    `Likely California streamlining pathways to check: CEQA categorical/statutory exemptions (Class 32 infill is common), SB 35 ministerial approval (needs affordability + objective-standards conformance), AB 130/AB 1633 timelines, and a state density bonus if affordable units are included. Each requires a conformance memo against the objective standards. Re-run when ASI:One is reachable for an eligibility determination.`,
  )
  return c.json({ projectId, answer })
})

// Hazards: site + environmental hazards bearing on the build.
agents.post('/hazards', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    projectId?: string
    question?: string
  }
  const projectId = body.projectId ?? 'demo'
  const { answer } = await runGroundedAgent(
    projectId,
    'Hazards',
    'You are Constructa\'s hazards agent. Identify the natural + environmental hazards ' +
      'relevant to the parcel (FEMA flood zone, USGS seismic, CAL FIRE wildfire, ' +
      'liquefaction, contamination) and the mitigation each forces into the build.',
    body.question ?? 'What site and environmental hazards should this project plan for?',
    `Hazards to screen for this parcel: FEMA flood zone (drives finished-floor elevation + flood venting), USGS seismic + liquefaction (drives foundation design per CBC Ch. 18), CAL FIRE wildfire severity (drives WUI Ch. 7A assemblies), and any contamination history (Phase I ESA). Each unresolved hazard forces a specific mitigation before permitting. Re-run when ASI:One is reachable for parcel-specific overlays.`,
  )
  return c.json({ projectId, answer })
})

// Record a compliance item the project has cleared (timeline check-off).
agents.post('/compliance/solve', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    projectId?: string
    title?: string
    stage?: string
    reference?: string
  }
  const projectId = body.projectId ?? 'demo'
  const data = await addSolvedCompliance(
    projectId,
    body.title ?? 'compliance item',
    body.stage ?? 'general',
    body.reference,
  )
  return c.json({ projectId, solvedCompliance: data.solvedCompliance })
})

// Voice Log: Deepgram transcript -> structured daily log (proxies to agent svc).
agents.post('/voice-log', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    const res = await fetch(`${AGENT_SERVICE_URL()}/voice-log`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    })
    if (res.ok) return c.json(await res.json())
  } catch {
    // agent-service offline — fall through to mock
  }
  return c.json({ log: { summary: 'mock daily log entry', raw: body } })
})

// Compliance Watchdog: conditions active/at-risk at a step (Fetch.ai uAgent).
agents.get('/watchdog/:projectId/:step', async (c) => {
  const { projectId, step } = c.req.param()
  try {
    const res = await fetch(
      `${AGENT_SERVICE_URL()}/watchdog/${projectId}/${step}`,
      { signal: AbortSignal.timeout(3000) },
    )
    if (res.ok) return c.json(await res.json())
  } catch {
    // agent-service offline — fall through to mock
  }
  return c.json({ projectId, step: Number(step), conditions: [], alerts: [] })
})


// --- Compliance PDF generation (spec §5/§6) -------------------------------
// Stage agent solutions are turned into compliance-formatted PDFs (via the
// Agentverse compliance agent, or a local fallback) and stored for download
// in the project's "Completed Work" panel — instead of dumping raw markdown.

interface StoredPdf {
  id: string
  projectId: string
  stage: string
  dailyLogId?: string
  filename: string
  createdAt: string
  referenceId: string
  bytesB64: string
}

agents.post('/compliance/pdf', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    projectId?: string
    stage?: string
    content?: string
    dailyLogId?: string
  }
  const projectId = body.projectId ?? 'demo'
  const stage = body.stage ?? 'General'
  const content = body.content ?? ''

  const doc = await formatForCompliance(stage, content, { projectId })
  const bytes = await renderComplianceDoc(doc)
  const id = doc.referenceId
  const safeStage = stage.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'stage'
  const filename = `compliance-${safeStage}-${id}.pdf`
  const createdAt = new Date().toISOString()

  const stored: StoredPdf = {
    id,
    projectId,
    stage,
    dailyLogId: body.dailyLogId,
    filename,
    createdAt,
    referenceId: doc.referenceId,
    bytesB64: Buffer.from(bytes).toString('base64'),
  }

  const redis = getRedis()
  if (redis) {
    try {
      await redis.set(keys.compliancePdf(projectId, id), JSON.stringify(stored), 'EX', 604800)
      await redis.lpush(keys.compliancePdfIndex(projectId), id)
      await redis.expire(keys.compliancePdfIndex(projectId), 604800)
    } catch (err) {
      console.warn('[compliance-pdf] redis write failed:', (err as Error).message)
    }
  }

  return c.json({
    id,
    projectId,
    stage,
    dailyLogId: body.dailyLogId,
    filename,
    createdAt,
    referenceId: doc.referenceId,
    url: `/api/agents/compliance/pdf/${projectId}/${id}`,
  })
})

agents.get('/compliance/pdf/:projectId', async (c) => {
  const projectId = c.req.param('projectId')
  const redis = getRedis()
  if (!redis) return c.json({ projectId, pdfs: [] })
  try {
    const ids = await redis.lrange(keys.compliancePdfIndex(projectId), 0, 50)
    const pdfs = []
    for (const id of ids) {
      const raw = await redis.get(keys.compliancePdf(projectId, id))
      if (!raw) continue
      const s = JSON.parse(raw) as StoredPdf
      pdfs.push({
        id: s.id,
        projectId: s.projectId,
        stage: s.stage,
        dailyLogId: s.dailyLogId,
        filename: s.filename,
        createdAt: s.createdAt,
        referenceId: s.referenceId,
        url: `/api/agents/compliance/pdf/${projectId}/${s.id}`,
      })
    }
    return c.json({ projectId, pdfs })
  } catch (err) {
    console.warn('[compliance-pdf] list failed:', (err as Error).message)
    return c.json({ projectId, pdfs: [] })
  }
})

agents.get('/compliance/pdf/:projectId/:id', async (c) => {
  const projectId = c.req.param('projectId')
  const id = c.req.param('id')
  const redis = getRedis()
  if (!redis) return c.json({ error: 'not found' }, 404)
  const raw = await redis.get(keys.compliancePdf(projectId, id))
  if (!raw) return c.json({ error: 'not found' }, 404)
  const s = JSON.parse(raw) as StoredPdf
  const bytes = Buffer.from(s.bytesB64, 'base64')
  c.header('Content-Type', 'application/pdf')
  c.header('Content-Disposition', `attachment; filename="${s.filename}"`)
  return c.body(bytes)
})

api.route('/agents', agents)