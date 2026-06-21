import { Hono } from 'hono'
import { getRedis, keys } from '~/lib/redis'
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
import { generateLandBuyingGuide, seededGuide } from '~/lib/asi'


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
  const liveMode = c.req.header('x-live-mode') === 'true'
  // Allow callers to force a fresh scrape, bypassing any cached result.
  const refresh =
    c.req.query('refresh') === 'true' || c.req.header('x-refresh') === 'true'
  const redis = getRedis()

  const paginate = (all: BusinessPartner[], live: boolean) => {
    const slice = all.slice(cursor, cursor + pageSize)
    const nextCursor = cursor + pageSize < all.length ? cursor + pageSize : null
    return c.json({ partners: slice, nextCursor, total: all.length, live })
  }

  const cacheKey = keys.regionPartners(regionId)

  // Serve cache only when not explicitly refreshing.
  if (!refresh && redis) {
    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        const partners = JSON.parse(cached) as BusinessPartner[]
        if (Array.isArray(partners) && partners.length) return paginate(partners, true)
      }
    } catch (err) {
      console.warn('[partners] cache read failed:', err)
    }
  }

  const mock = mockPartners(regionId)
  if (!liveMode) return paginate(mock, false)

  try {
    const { partners, live } = await scrapeLocalPartners(regionId)
    // CRITICAL: only cache real live data — never cache the mock fallback,
    // otherwise stale fake contractors get served forever.
    if (live && partners.length) {
      try {
        if (redis) await redis.set(cacheKey, JSON.stringify(partners), 'EX', 7200)
      } catch (err) {
        console.warn('[partners] cache write failed:', err)
      }
      return paginate(partners, true)
    }
    return paginate(partners.length ? partners : mock, false)
  } catch (err) {
    console.error('[partners] live failed, serving mock:', err)
    return paginate(mock, false)
  }
})

api.route('/map', map)

// --- Project + the live build sequence -------------------------------------
const project = new Hono()

project.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const id = crypto.randomUUID()
  const redis = getRedis()
  const record = { id, status: 'created', ...body }
  if (redis) await redis.set(keys.project(id), JSON.stringify(record))
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

api.route('/project', project)

// --- Agents (exactly 3, one per agent) -------------------------------------
const agents = new Hono()

// Voice Log: Deepgram transcript -> structured daily log (Claude).
agents.post('/voice-log', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  return c.json({ log: { summary: 'mock daily log entry', raw: body } })
})

// RFI Resolution: question -> cited draft answer (Redis vector RAG + Claude).
agents.post('/rfi', async (c) => {
  const { question } = await c.req.json().catch(() => ({ question: '' }))
  const answer = await complete(
    `Answer this construction RFI with citations: ${question}`,
  )
  return c.json({ question, answer, citations: [] })
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
    // agent-service offline â€” fall through to mock
  }
  return c.json({ projectId, step: Number(step), conditions: [], alerts: [] })
})

api.route('/agents', agents)