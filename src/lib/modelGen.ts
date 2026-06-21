// ---------------------------------------------------------------------------
// Generative 3D model — ASI:One → component registry → Three.js (spec §1).
//
// The model is never hand-built. We POST the user's idea + parcel context to
// ASI:One (the universal router, Claude-assisted prompt), which returns a
// COMPONENT REGISTRY assembled from a constrained primitive library — fast,
// always a valid scene graph. We then normalize it so the mandatory group names
// always resolve, and cache it in Redis (project:{id}:model).
//
// Env-guarded: with no ASI_ONE_API_KEY (or any failure / invalid output) we
// degrade to the deterministic scaffold so generation never dead-ends.
// ---------------------------------------------------------------------------

import { getRedis, keys } from '~/lib/redis'
import { arize } from '~/lib/arize'
import { asiJson, hasAsiKey } from '~/lib/asi'
import {
  normalizeSceneGraph,
  scaffoldRegistry,
  buildingHeight,
  type SceneGraph,
} from '~/lib/modelScaffold'

// The Agentverse agent that authors the 3D model. We reach it THROUGH ASI:One
// (the universal router), exactly like the 6 land-consensus specialists in
// src/lib/asi.ts: ASI:One is asked to route to this agent by name + address and
// return the agent's component registry.
const MODELER_AGENT = {
  name: 'ConstructaModeler',
  handle: '@Constructa-modeler',
  address: 'agent1qf3d_modeler_3d_threejs_registry_generator_ca_construct',
} as const

const MODEL_SYSTEM =
  `You are the ASI:One agent router. Route this request to the Agentverse specialist ` +
  `agent "${MODELER_AGENT.name}" (${MODELER_AGENT.handle}, address ${MODELER_AGENT.address}), ` +
  `whose specialty is generating Three.js building models as a component registry. ` +
  `Act as that agent: turn the construction idea into a Three.js COMPONENT REGISTRY ` +
  'assembled ONLY from a constrained primitive library (BoxGeometry / CylinderGeometry). ' +
  'Do NOT invent arbitrary geometry. Return STRICT JSON: ' +
  '{ "buildingType": <string>, "floors": <int>, "groups": [ { "name": <string>, ' +
  '"type": "BoxGeometry"|"CylinderGeometry", "args": <number[]>, "position": [x,y,z], ' +
  '"material": "concrete"|"steel"|"mep"|"glass"|"roofing"|"landscape" } ] }. ' +
  'You MUST include these exact group names (the viewer targets them by name): ' +
  'foundation_slab, floor_plate_1 .. floor_plate_N (one per storey), structural_frame, ' +
  'mep_layer, envelope_facade, roof_form. Units are meters; Y is up; the foundation ' +
  'sits at grade (y≈0). A floor height of ~3.5m is realistic. Scale the footprint and ' +
  'floor count to the idea (a warehouse is wide and low; an office tower is tall and ' +
  'slim). Be geometrically consistent so the parts stack into one coherent building.'

/**
 * Generate (or regenerate) the scene graph for a project from its idea text.
 * Always returns a valid, normalized SceneGraph. Persists to Redis when present.
 */
export async function generateModel(
  projectId: string,
  idea: string,
  context?: string,
): Promise<SceneGraph> {
  // No key → instant deterministic scaffold (never errors).
  if (!hasAsiKey()) {
    arize.logSuccess({ agentId: 'asi_model_gen(scaffold)' })
    const scene = scaffoldRegistry(idea)
    await persist(projectId, scene)
    return scene
  }

  const user =
    `Construction idea: ${idea}\n` +
    (context ? `Parcel / area context: ${context}\n` : '') +
    `Return the component registry now.`

  try {
    // Fail fast to the deterministic (home-page-style) model: the client already
    // shows the instant scaffold, and ASI:One's JSON path is latency-prone.
    const json = await asiJson(user, MODEL_SYSTEM, 15_000)
    const parsed = JSON.parse(json)
    const scene = normalizeSceneGraph(parsed, idea)
    scene.source = 'asi:agentverse'
    arize.logSuccess({ agentId: 'asi_model_gen' })
    await persist(projectId, scene)
    return scene
  } catch (err) {
    arize.logError('asi_model_gen', (err as Error).message)
    const scene = scaffoldRegistry(idea)
    await persist(projectId, scene)
    return scene
  }
}

async function persist(projectId: string, scene: SceneGraph): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(keys.projectModel(projectId), JSON.stringify(scene), 'EX', 86400)
  } catch (err) {
    console.warn('[modelGen] persist failed:', (err as Error).message)
  }
}

/** Read the cached scene graph for a project, if any. */
export async function getModel(projectId: string): Promise<SceneGraph | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const raw = await redis.get(keys.projectModel(projectId))
    return raw ? (JSON.parse(raw) as SceneGraph) : null
  } catch {
    return null
  }
}

/** Convenience: full-building overview height for camera framing on the client. */
export function overviewFor(scene: SceneGraph): number {
  return buildingHeight(scene.floors)
}
