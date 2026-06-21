// ---------------------------------------------------------------------------
// Central project data (spec §4 — Data Holding).
//
// A single Redis document per project holding the data every agent needs when
// its button is pressed: the idea, the parcel/district, local partners, the
// running list of previous problems, and compliance docs already solved. Agents
// read this as grounding context so a question never starts cold.
//
// Redis key: project:{id}:data  (in-memory fallback so it works keyless).
// ---------------------------------------------------------------------------

import { getRedis, keys } from '~/lib/redis'

export interface ProjectProblem {
  id: string
  at: string
  stage: string
  summary: string
  resolved: boolean
}

export interface SolvedCompliance {
  id: string
  at: string
  title: string
  stage: string
  reference?: string
}

export interface DailyLog {
  id: string
  at: string
  stage: string
  text: string
}

export interface ProjectData {
  id: string
  idea: string
  district: string | null
  buildingType?: string
  partners: string[] // names of local partners attached to the project
  problems: ProjectProblem[]
  solvedCompliance: SolvedCompliance[]
  logs: DailyLog[]
  updatedAt: string
}

const mem = new Map<string, ProjectData>()

function empty(id: string): ProjectData {
  return {
    id,
    idea: '',
    district: null,
    partners: [],
    problems: [],
    solvedCompliance: [],
    logs: [],
    updatedAt: new Date().toISOString(),
  }
}

function normalize(data: ProjectData): ProjectData {
  // Backfill arrays for records written before a field existed.
  data.partners ??= []
  data.problems ??= []
  data.solvedCompliance ??= []
  data.logs ??= []
  return data
}

export async function readProjectData(id: string): Promise<ProjectData> {
  const redis = getRedis()
  if (redis) {
    try {
      const raw = await redis.get(keys.projectData(id))
      if (raw) return normalize(JSON.parse(raw) as ProjectData)
    } catch (err) {
      console.warn('[projectData] read failed:', (err as Error).message)
    }
  }
  return mem.get(id) ?? empty(id)
}

export async function writeProjectData(data: ProjectData): Promise<void> {
  data.updatedAt = new Date().toISOString()
  mem.set(data.id, data)
  const redis = getRedis()
  if (redis) {
    try {
      await redis.set(keys.projectData(data.id), JSON.stringify(data), 'EX', 604800)
    } catch (err) {
      console.warn('[projectData] write failed:', (err as Error).message)
    }
  }
}

/** Merge a partial update into the project's central data. */
export async function patchProjectData(
  id: string,
  patch: Partial<Omit<ProjectData, 'id'>>,
): Promise<ProjectData> {
  const current = await readProjectData(id)
  const next: ProjectData = { ...current, ...patch, id }
  await writeProjectData(next)
  return next
}

/** Append a newly-encountered problem (deduped lightly by summary). */
export async function addProblem(
  id: string,
  stage: string,
  summary: string,
): Promise<ProjectData> {
  const data = await readProjectData(id)
  if (!data.problems.some((p) => p.summary === summary)) {
    data.problems.unshift({
      id: cryptoRandom(),
      at: new Date().toISOString(),
      stage,
      summary,
      resolved: false,
    })
    data.problems = data.problems.slice(0, 50)
    await writeProjectData(data)
  }
  return data
}

/** Append a structured daily log to the project's record. */
export async function addDailyLog(
  id: string,
  stage: string,
  text: string,
): Promise<ProjectData> {
  const data = await readProjectData(id)
  if (text.trim()) {
    data.logs.unshift({
      id: cryptoRandom(),
      at: new Date().toISOString(),
      stage,
      text: text.trim(),
    })
    data.logs = data.logs.slice(0, 100)
    await writeProjectData(data)
  }
  return data
}

/** Record a compliance item the project has cleared. */
export async function addSolvedCompliance(
  id: string,
  title: string,
  stage: string,
  reference?: string,
): Promise<ProjectData> {
  const data = await readProjectData(id)
  if (!data.solvedCompliance.some((s) => s.title === title)) {
    data.solvedCompliance.unshift({
      id: cryptoRandom(),
      at: new Date().toISOString(),
      title,
      stage,
      reference,
    })
    await writeProjectData(data)
  }
  return data
}

/** Compact, agent-ready grounding string assembled from the central data. */
export function groundingContext(data: ProjectData): string {
  const parts: string[] = []
  if (data.idea) parts.push(`Idea: ${data.idea}`)
  if (data.district) parts.push(`District: ${data.district}`)
  if (data.buildingType) parts.push(`Type: ${data.buildingType}`)
  if (data.partners.length) parts.push(`Local partners: ${data.partners.join(', ')}`)
  if (data.solvedCompliance.length)
    parts.push(`Already cleared: ${data.solvedCompliance.map((s) => s.title).join('; ')}`)
  if (data.problems.length)
    parts.push(
      `Open problems: ${data.problems.filter((p) => !p.resolved).map((p) => p.summary).join('; ')}`,
    )
  return parts.join('\n')
}

function cryptoRandom(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return Math.random().toString(36).slice(2)
  }
}
