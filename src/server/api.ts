import { Hono } from 'hono'
import { getRedis, keys } from '~/lib/redis'
import { complete } from '~/lib/claude'

// ---------------------------------------------------------------------------
// Web API (Hono), mounted inside TanStack Start via `src/routes/api/$.ts`.
// Owns map reads, project CRUD, Claude calls, and the 10-step state machine.
// Every route maps to a page flow or one of the 3 agents (BUILD_PLAN §6).
//
// Handlers are intentionally thin stubs returning mock/cached shapes so the
// frontend is fully runnable today. Real Redis/Claude/agent wiring drops in
// behind the same response contracts.
// ---------------------------------------------------------------------------

const AGENT_SERVICE_URL = () =>
  process.env.AGENT_SERVICE_URL ?? 'http://localhost:8000'

export const api = new Hono().basePath('/api')

api.get('/health', (c) => c.json({ ok: true, service: 'Construca-web-api' }))

// --- Map (read-only, cache-backed) -----------------------------------------
const map = new Hono()

map.get('/states', (c) =>
  c.json({ source: 'cache', features: [], note: 'national heatmap data' }),
)

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
    'You are Construca, an AI construction foreman.',
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
    // agent-service offline — fall through to mock
  }
  return c.json({ projectId, step: Number(step), conditions: [], alerts: [] })
})

api.route('/agents', agents)
