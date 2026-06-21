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
  `You are the ASI:One agent router acting as the Agentverse specialist ` +
  `"${MODELER_AGENT.name}" (${MODELER_AGENT.handle}). ` +
  `Your specialty: generate accurate, geometrically distinctive Three.js building models ` +
  `as a component registry using ONLY BoxGeometry / CylinderGeometry primitives. ` +
  `Think deeply about the building type before generating geometry — each type must look ` +
  `structurally different, not just a resized box. ` +
  `\n\nReturn STRICT JSON: { "buildingType": <string>, "floors": <int>, "groups": [ { ` +
  `"name": <string>, "type": "BoxGeometry"|"CylinderGeometry", "args": <number[]>, ` +
  `"position": [x,y,z], "rotation"?: [rx,ry,rz], ` +
  `"material": "concrete"|"steel"|"mep"|"glass"|"roofing"|"landscape" } ] }. ` +
  `\n\nMANDATORY group names (viewer targets these by name): ` +
  `foundation_slab, floor_plate_1..floor_plate_N (one per storey), structural_frame, ` +
  `mep_layer, envelope_facade, roof_form. You MAY add extra named groups for ` +
  `building-specific features (ramp, garage_volume, setback_tier, secondary_wing, etc.). ` +
  `\n\nUnits: meters; Y is up; foundation at y≈0; standard floor height 3.5m. ` +
  `\n\nPER-TYPE GEOMETRY RULES (follow strictly): ` +
  `\n• PARKING STRUCTURE: floors 3-6 max, floor height 2.8m (NOT 3.5m). Wide low footprint ` +
  `(60m×28m typical). No glass facade — use open concrete bay_frame sides. Add ramp_access ` +
  `group: BoxGeometry [4, 0.3, 28] rotated ~0.2rad on X axis, positioned at one end. ` +
  `Material: concrete throughout. Flat roof. ` +
  `\n• LUXURY PENTHOUSE TOWER: slim tower base 26m×22m, 30-45 floors. Every 8 floors add ` +
  `a setback_tier_N group (2m narrower each side) using BoxGeometry for the setback slab. ` +
  `Full-height glass curtain wall facade. Add terrace_deck groups at each setback. ` +
  `Steel + glass materials. Flat contemporary roof. ` +
  `\n• SCHOOL / CAMPUS: 2-4 floors, wide main wing (40m×24m). Add secondary_wing group ` +
  `(BoxGeometry [28,12,18] offset by +25m on X). Add gymnasium_volume group ` +
  `(BoxGeometry [22,8,16] offset -20m X, 0m Y from grade). Low pitched roof possible. ` +
  `\n• SINGLE-FAMILY HOME: 1-2 floors only, small footprint 14m×12m. Add garage_volume ` +
  `(BoxGeometry [6,3,6] offset to one side). Replace flat roof_form with two gable panels: ` +
  `roof_gable_left BoxGeometry [8,0.2,12] rotated 0.4rad, roof_gable_right mirror. ` +
  `Concrete + wood materials. ` +
  `\n• WAREHOUSE / INDUSTRIAL: 1-2 floors, massive footprint (50m×35m). Add loading_dock ` +
  `group (BoxGeometry [12,4,6] at rear). Barrel/shed roof: roof_ridge cylinder on top. ` +
  `\n• OFFICE TOWER: 10-30 floors, 24m×24m, full curtain-wall glass facade, steel frame. ` +
  `\n• HOTEL: 8-20 floors, 26m×20m, glass + concrete, add lobby_volume at grade. ` +
  `\nFor any type not listed above: pick geometrically appropriate dimensions and extras. ` +
  `Think like a real architect — make each building visually unmistakable.`

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

  // Retry once on failure — ASI:One can be slow on detailed geometry prompts.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const json = await asiJson(user, MODEL_SYSTEM, 45_000)
      const parsed = JSON.parse(json)
      if (!parsed || !Array.isArray(parsed.groups) || parsed.groups.length === 0) {
        throw new Error('Empty or invalid groups array')
      }
      const scene = normalizeSceneGraph(parsed, idea)
      scene.source = 'asi:agentverse'
      arize.logSuccess({ agentId: 'asi_model_gen' })
      await persist(projectId, scene)
      return scene
    } catch (err) {
      arize.logError(`asi_model_gen(attempt ${attempt})`, (err as Error).message)
      if (attempt === 2) {
        const scene = scaffoldRegistry(idea)
        await persist(projectId, scene)
        return scene
      }
      // Brief pause before retry so ASI:One isn't hit immediately again.
      await new Promise((r) => setTimeout(r, 2_000))
    }
  }
  // Unreachable but satisfies TypeScript.
  const scene = scaffoldRegistry(idea)
  await persist(projectId, scene)
  return scene
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
