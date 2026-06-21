// Client fetchers for the project workspace: model generation, the execution
// plan / timeline, the 6 agents, and the central project data. Thin wrappers
// over /api/project/* and /api/agents/*.

import type { SceneGraph } from '~/lib/modelScaffold'
import type { ExecutionPlan } from '~/lib/planTypes'
import type { RegionDeepDive } from '~/lib/mapClient'

export type { SceneGraph, ModelGroup } from '~/lib/modelScaffold'
export type { ExecutionPlan, PlanStage } from '~/lib/planTypes'

// sessionStorage key the map deep-dive CTA writes the full forward-cache to.
export const DEEP_DIVE_CACHE_KEY = 'Constructa:deepDive'

export interface CachedDeepDive {
  regionId: string
  regionLabel: string
  deepDive: RegionDeepDive
}

export interface CompliancePdfMeta {
  id: string
  projectId: string
  stage: string
  dailyLogId?: string
  filename: string
  createdAt: string
  referenceId: string
  url: string
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json() as Promise<T>
}

export const projectClient = {
  /** Read the forward-cached deep-dive the map wrote before navigating here. */
  cachedDeepDive(): CachedDeepDive | null {
    try {
      const raw = sessionStorage.getItem(DEEP_DIVE_CACHE_KEY)
      return raw ? (JSON.parse(raw) as CachedDeepDive) : null
    } catch {
      return null
    }
  },

  create: (body: { idea?: string; district?: string | null; partners?: string[] }) =>
    postJson<{ id: string }>('/api/project', body),

  generateModel: (
    id: string,
    body: { idea: string; context?: string; district?: string | null },
  ) => postJson<{ id: string; model: SceneGraph }>(`/api/project/${id}/generate-model`, body),

  generatePlan: (id: string, body: { idea?: string; district?: string | null }) =>
    postJson<{ id: string; plan: ExecutionPlan }>(`/api/project/${id}/execution-plan`, body),

  getModel: async (id: string): Promise<SceneGraph | null> => {
    const res = await fetch(`/api/project/${id}/model`)
    if (!res.ok) return null
    return (await res.json()).model ?? null
  },

  getPlan: async (id: string): Promise<ExecutionPlan | null> => {
    const res = await fetch(`/api/project/${id}/plan`)
    if (!res.ok) return null
    return (await res.json()).plan ?? null
  },

  /** Call one of the 6 agents (daily-briefing | rfi | compliance | permit-research | hazards). */
  agent: (name: string, body: Record<string, unknown>) =>
    postJson<Record<string, unknown>>(`/api/agents/${name}`, body),

  solveCompliance: (body: {
    projectId: string
    title: string
    stage?: string
    reference?: string
  }) => postJson<unknown>('/api/agents/compliance/solve', body),

  /** Turn an agent's stage solution into a stored, downloadable compliance PDF. */
  generateCompliancePdf: (body: {
    projectId: string
    stage: string
    content: string
    dailyLogId?: string
  }) =>
    postJson<CompliancePdfMeta>('/api/agents/compliance/pdf', body),

  /** List generated compliance PDFs for a project (newest first, no bytes). */
  listCompliancePdfs: async (projectId: string): Promise<CompliancePdfMeta[]> => {
    const res = await fetch(`/api/agents/compliance/pdf/${projectId}`)
    if (!res.ok) return []
    return ((await res.json()).pdfs ?? []) as CompliancePdfMeta[]
  },

  /** Download URL for a stored compliance PDF. */
  compliancePdfUrl: (projectId: string, id: string) =>
    `/api/agents/compliance/pdf/${projectId}/${id}`,
}