// ---------------------------------------------------------------------------
// Isomorphic model scaffold — the constrained primitive library that backs the
// generative 3D model (visualization spec §1).
//
// Pure + dependency-free so it runs in BOTH places:
//   • client — an INSTANT deterministic scaffold rendered the moment the user
//     submits, so the canvas is never blank while ASI:One generates.
//   • server — the deterministic FALLBACK when ASI:One is unavailable or
//     returns an invalid scene graph (src/lib/modelGen.ts).
//
// The mandatory group names are guaranteed here so the viewer's
// getObjectByName() / STAGE_TO_MESH targeting always resolves:
//   foundation_slab, floor_plate_N, structural_frame, mep_layer,
//   envelope_facade, roof_form
// ---------------------------------------------------------------------------

export type PrimitiveType = 'BoxGeometry' | 'CylinderGeometry'

export interface ModelGroup {
  name: string
  type: PrimitiveType
  args: number[]
  position: [number, number, number]
  rotation?: [number, number, number]
  material: string // concrete | steel | mep | glass | roofing | landscape | ...
}

export interface SceneGraph {
  buildingType: string
  floors: number
  groups: ModelGroup[]
  source?: string // 'asi:one' | 'scaffold' | 'cache'
}

// The exact, mandatory group names the viewer + timeline target by name.
export const REQUIRED_GROUPS = [
  'foundation_slab',
  'structural_frame',
  'mep_layer',
  'envelope_facade',
  'roof_form',
] as const

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  single: 1, double: 2, triple: 3,
}

export interface ParsedIdea {
  buildingType: string
  floors: number
  width: number
  depth: number
}

/** Extract building type + floor count + a sane footprint from free text. */
export function parseIdea(idea: string): ParsedIdea {
  const text = (idea || '').toLowerCase()

  // Floors — "3-story", "three story", "5 floors", "G+4".
  let floors = 2
  const digitMatch = text.match(/(\d{1,2})\s*[-\s]?\s*(stor|floor|level|fl\b)/)
  const wordMatch = text.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b\s*[-\s]?\s*(stor|floor|level)/,
  )
  const gPlus = text.match(/g\s*\+\s*(\d{1,2})/)
  if (digitMatch) floors = parseInt(digitMatch[1]!, 10)
  else if (wordMatch) floors = NUMBER_WORDS[wordMatch[1]!] ?? 2
  else if (gPlus) floors = parseInt(gPlus[1]!, 10) + 1
  floors = Math.max(1, Math.min(40, floors))

  // Building type + footprint heuristics.
  let buildingType = 'mixed-use building'
  let width = 20
  let depth = 20
  const set = (t: string, w: number, d: number) => {
    buildingType = t
    width = w
    depth = d
  }
  if (/parking|park ?structure|car ?park|parking garage/.test(text)) set('parking structure', 60, 28)
  else if (/penthouse|ultra[\s-]?luxury|luxury tower|luxury high[\s-]?rise/.test(text)) set('luxury penthouse tower', 26, 22)
  else if (/warehouse|distribution|logistics|fulfillment/.test(text)) set('warehouse', 48, 32)
  else if (/data ?center|server farm/.test(text)) set('data center', 40, 30)
  else if (/mall|shopping|retail center|plaza/.test(text)) set('retail center', 44, 30)
  else if (/office|corporate|hq|headquarters/.test(text)) set('office tower', 24, 24)
  else if (/hotel|hospitality|resort/.test(text)) set('hotel', 26, 20)
  else if (/hospital|clinic|medical/.test(text)) set('medical facility', 34, 26)
  else if (/school|campus|university|college/.test(text)) set('school campus', 38, 24)
  // Explicit "mixed-use" wins over the apartment/retail keywords it contains.
  else if (/mixed[\s-]?use/.test(text)) set('mixed-use building', 22, 18)
  else if (/apartment|residential|condo|housing|multifamily|multi-family/.test(text))
    set('residential block', 28, 20)
  else if (/single ?family|house|home|adu/.test(text)) set('single-family home', 14, 12)
  else if (/factory|industrial|manufactur/.test(text)) set('industrial', 44, 30)

  // Tall programs get a slimmer footprint; very tall implies a tower core.
  if (floors >= 8 && width > 26) {
    width = Math.max(20, width - 8)
    depth = Math.max(18, depth - 6)
  }

  return { buildingType, floors, width, depth }
}

const FLOOR_HEIGHT = 3.5
const SLAB = 0.5

/** Total building height (top of roof) for a parsed idea — used for framing. */
export function buildingHeight(floors: number): number {
  return SLAB + floors * FLOOR_HEIGHT + 0.6
}

// If the idea already describes its own grounds we leave the site to the model;
// otherwise we drop in a pre-made context set (roads, sidewalks, trees, a small
// park, lamp posts) so a bare prompt still renders as a real site, not a box.
const LANDSCAPE_KEYWORDS =
  /landscap|garden|courtyard|plaza|greenery|\btrees?\b|\bpark\b|lawn|grounds|streetscape/i

export function wantsAutoLandscape(idea: string): boolean {
  return !LANDSCAPE_KEYWORDS.test(idea || '')
}

// Material families that mark a group as "site" (so we don't double-add and so
// the viewer keeps them when the solid massing is stripped).
const SITE_MATERIALS = ['asphalt', 'paving', 'trunk', 'foliage', 'grass', 'lamp']
function hasSiteGroups(groups: ModelGroup[]): boolean {
  return groups.some(
    (g) => SITE_MATERIALS.includes(g.material) || g.name.startsWith('tree_') || g.name.startsWith('road_'),
  )
}

/**
 * Pre-made landscape/context set sized to the building footprint. Uses only Box
 * + Cylinder primitives (cones = cylinder with radiusTop 0), every group named
 * uniquely so React keys + getObjectByName stay clean.
 */
export function siteLandscape(width: number, depth: number): ModelGroup[] {
  const g: ModelGroup[] = []
  const hx = width / 2
  const hz = depth / 2
  const ROAD_W = 7

  // Perimeter roads (front along X, side along Z) + lane dashes.
  g.push({ name: 'road_front', type: 'BoxGeometry', args: [width + 70, 0.06, ROAD_W], position: [0, 0.03, hz + 15], material: 'asphalt' })
  g.push({ name: 'road_side', type: 'BoxGeometry', args: [ROAD_W, 0.06, depth + 70], position: [hx + 15, 0.03, 0], material: 'asphalt' })
  for (let i = -2; i <= 2; i++) {
    g.push({ name: `road_dash_${i + 2}`, type: 'BoxGeometry', args: [3, 0.07, 0.4], position: [i * 9, 0.05, hz + 15], material: 'paving' })
  }

  // Sidewalks between building and roads.
  g.push({ name: 'sidewalk_front', type: 'BoxGeometry', args: [width + 34, 0.08, 3.5], position: [0, 0.04, hz + 9], material: 'paving' })
  g.push({ name: 'sidewalk_side', type: 'BoxGeometry', args: [3.5, 0.08, depth + 34], position: [hx + 9, 0.04, 0], material: 'paving' })

  // A small park (lawn patch) tucked off the back-left corner.
  g.push({ name: 'park_lawn', type: 'BoxGeometry', args: [22, 0.1, 18], position: [-(hx + 19), 0.05, -(hz + 5)], material: 'grass' })

  const tree = (id: string, x: number, z: number, s = 1) => {
    const trunkH = 2.4 * s
    const canopyH = 4.4 * s
    g.push({ name: `tree_trunk_${id}`, type: 'CylinderGeometry', args: [0.32 * s, 0.42 * s, trunkH, 6], position: [x, trunkH / 2, z], material: 'trunk' })
    g.push({ name: `tree_canopy_${id}`, type: 'CylinderGeometry', args: [0, 2.3 * s, canopyH, 8], position: [x, trunkH + canopyH / 2 - 0.4, z], material: 'foliage' })
  }
  // Street trees along the front + side, then a cluster in the park.
  for (let i = -2; i <= 2; i++) tree(`f${i + 2}`, i * 8, hz + 5.5, 1)
  for (let i = -1; i <= 1; i++) tree(`s${i + 1}`, hx + 5.5, i * 9, 1)
  tree('p1', -(hx + 15), -(hz + 2), 1.15)
  tree('p2', -(hx + 23), -(hz + 9), 0.9)
  tree('p3', -(hx + 24), -(hz + 1), 1)

  const lamp = (id: string, x: number, z: number) => {
    g.push({ name: `lamp_pole_${id}`, type: 'CylinderGeometry', args: [0.16, 0.2, 5, 6], position: [x, 2.5, z], material: 'lamp' })
    g.push({ name: `lamp_head_${id}`, type: 'BoxGeometry', args: [1.4, 0.3, 0.5], position: [x, 4.95, z], material: 'lamp' })
  }
  lamp('1', -(hx + 2), hz + 9)
  lamp('2', hx + 2, hz + 9)
  lamp('3', hx + 9, -(hz + 4))

  return g
}

/**
 * Build a complete, valid scene graph from an idea string using only the
 * constrained primitive library. Always produces every required group so the
 * viewer + timeline targeting never breaks.
 *
 * Building types produce geometrically distinct models — not just resized boxes.
 */
export function scaffoldRegistry(idea: string): SceneGraph {
  const { buildingType, floors, width, depth } = parseIdea(idea)

  let scene: SceneGraph
  if (buildingType === 'parking structure') scene = scaffoldParking(buildingType, floors, width, depth)
  else if (buildingType === 'luxury penthouse tower') scene = scaffoldPenthouse(buildingType, floors, width, depth)
  else if (buildingType === 'school campus') scene = scaffoldSchool(buildingType, floors, width, depth)
  else if (buildingType === 'single-family home') scene = scaffoldHome(buildingType, floors, width, depth)
  else if (buildingType === 'warehouse') scene = scaffoldWarehouse(buildingType, floors, width, depth)
  else scene = scaffoldGeneric(buildingType, floors, width, depth)

  if (wantsAutoLandscape(idea) && !hasSiteGroups(scene.groups)) {
    scene.groups.push(...siteLandscape(width, depth))
  }
  return scene
}

function scaffoldGeneric(buildingType: string, floors: number, width: number, depth: number): SceneGraph {
  const groups: ModelGroup[] = []
  const isGlassy = /office|hotel|hospital|residential|mixed/.test(buildingType)

  groups.push({ name: 'foundation_slab', type: 'BoxGeometry', args: [width + 0.6, SLAB, depth + 0.6], position: [0, SLAB / 2, 0], material: 'concrete' })

  for (let i = 0; i < floors; i++) {
    groups.push({ name: `floor_plate_${i + 1}`, type: 'BoxGeometry', args: [width, 0.3, depth], position: [0, SLAB + i * FLOOR_HEIGHT + 0.15, 0], material: 'concrete' })
  }

  const frameTop = SLAB + floors * FLOOR_HEIGHT
  const frameHeight = frameTop - SLAB
  const frameMidY = SLAB + frameHeight / 2

  groups.push({ name: 'structural_frame', type: 'BoxGeometry', args: [width, frameHeight, depth], position: [0, frameMidY, 0], material: 'steel' })
  groups.push({ name: 'mep_layer', type: 'BoxGeometry', args: [width - 1.5, 0.8, depth - 1.5], position: [0, frameTop - 0.6, 0], material: 'mep' })
  groups.push({ name: 'envelope_facade', type: 'BoxGeometry', args: [width + 0.2, frameHeight, 0.2], position: [0, frameMidY, depth / 2], material: isGlassy ? 'glass' : 'concrete' })
  groups.push({ name: 'roof_form', type: 'BoxGeometry', args: [width, 0.4, depth], position: [0, frameTop + 0.2, 0], material: 'roofing' })

  return { buildingType, floors, groups, source: 'scaffold' }
}

function scaffoldParking(buildingType: string, floors: number, width: number, depth: number): SceneGraph {
  const groups: ModelGroup[] = []
  const fh = 2.8 // parking floor height is lower than standard

  groups.push({ name: 'foundation_slab', type: 'BoxGeometry', args: [width + 0.6, SLAB, depth + 0.6], position: [0, SLAB / 2, 0], material: 'concrete' })

  for (let i = 0; i < floors; i++) {
    groups.push({ name: `floor_plate_${i + 1}`, type: 'BoxGeometry', args: [width, 0.25, depth], position: [0, SLAB + i * fh + 0.15, 0], material: 'concrete' })
  }

  const frameTop = SLAB + floors * fh
  const frameHeight = frameTop - SLAB
  const frameMidY = SLAB + frameHeight / 2

  // Open concrete bay frame — no glass, open sides.
  groups.push({ name: 'structural_frame', type: 'BoxGeometry', args: [width, frameHeight, depth], position: [0, frameMidY, 0], material: 'concrete' })
  groups.push({ name: 'mep_layer', type: 'BoxGeometry', args: [width - 2, 0.5, depth - 2], position: [0, frameTop - 0.4, 0], material: 'mep' })
  // Open concrete parapet instead of glass facade.
  groups.push({ name: 'envelope_facade', type: 'BoxGeometry', args: [width + 0.2, frameHeight, 0.3], position: [0, frameMidY, depth / 2], material: 'concrete' })
  groups.push({ name: 'roof_form', type: 'BoxGeometry', args: [width, 0.3, depth], position: [0, frameTop + 0.15, 0], material: 'concrete' })
  // Ramp — angled slab at one end of the structure.
  groups.push({ name: 'ramp_access', type: 'BoxGeometry', args: [6, 0.3, depth * 0.8], position: [width / 2 - 4, frameMidY, 0], rotation: [0.22, 0, 0], material: 'concrete' })

  return { buildingType, floors, groups, source: 'scaffold' }
}

function scaffoldPenthouse(buildingType: string, floors: number, width: number, depth: number): SceneGraph {
  const groups: ModelGroup[] = []
  // Default penthouse to tall tower if not specified.
  const actualFloors = Math.max(floors, 24)

  groups.push({ name: 'foundation_slab', type: 'BoxGeometry', args: [width + 0.6, SLAB, depth + 0.6], position: [0, SLAB / 2, 0], material: 'concrete' })

  for (let i = 0; i < actualFloors; i++) {
    // Setback: each tier of 8 floors is 2m narrower on each side.
    const tier = Math.floor(i / 8)
    const tw = Math.max(14, width - tier * 2)
    const td = Math.max(12, depth - tier * 2)
    groups.push({ name: `floor_plate_${i + 1}`, type: 'BoxGeometry', args: [tw, 0.3, td], position: [0, SLAB + i * FLOOR_HEIGHT + 0.15, 0], material: 'concrete' })
  }

  const frameTop = SLAB + actualFloors * FLOOR_HEIGHT
  const frameHeight = frameTop - SLAB
  const frameMidY = SLAB + frameHeight / 2

  groups.push({ name: 'structural_frame', type: 'BoxGeometry', args: [width, frameHeight, depth], position: [0, frameMidY, 0], material: 'steel' })
  groups.push({ name: 'mep_layer', type: 'BoxGeometry', args: [width - 2, 0.8, depth - 2], position: [0, frameTop - 0.6, 0], material: 'mep' })
  // Full-height glass curtain wall.
  groups.push({ name: 'envelope_facade', type: 'BoxGeometry', args: [width + 0.2, frameHeight, 0.15], position: [0, frameMidY, depth / 2], material: 'glass' })
  groups.push({ name: 'roof_form', type: 'BoxGeometry', args: [14, 0.4, 12], position: [0, frameTop + 0.2, 0], material: 'roofing' })
  // Terrace decks at setback levels (every 8 floors).
  for (let tier = 1; tier * 8 < actualFloors; tier++) {
    const terY = SLAB + tier * 8 * FLOOR_HEIGHT
    const terW = Math.max(14, width - (tier - 1) * 2)
    const terD = Math.max(12, depth - (tier - 1) * 2)
    groups.push({ name: `terrace_deck_${tier}`, type: 'BoxGeometry', args: [terW, 0.2, terD], position: [0, terY + 0.1, 0], material: 'landscape' })
  }

  return { buildingType, floors: actualFloors, groups, source: 'scaffold' }
}

function scaffoldSchool(buildingType: string, floors: number, width: number, depth: number): SceneGraph {
  const groups: ModelGroup[] = []
  const actualFloors = Math.min(floors, 4)

  groups.push({ name: 'foundation_slab', type: 'BoxGeometry', args: [width + 0.6, SLAB, depth + 0.6], position: [0, SLAB / 2, 0], material: 'concrete' })

  for (let i = 0; i < actualFloors; i++) {
    groups.push({ name: `floor_plate_${i + 1}`, type: 'BoxGeometry', args: [width, 0.3, depth], position: [0, SLAB + i * FLOOR_HEIGHT + 0.15, 0], material: 'concrete' })
  }

  const frameTop = SLAB + actualFloors * FLOOR_HEIGHT
  const frameHeight = frameTop - SLAB
  const frameMidY = SLAB + frameHeight / 2

  groups.push({ name: 'structural_frame', type: 'BoxGeometry', args: [width, frameHeight, depth], position: [0, frameMidY, 0], material: 'concrete' })
  groups.push({ name: 'mep_layer', type: 'BoxGeometry', args: [width - 1.5, 0.8, depth - 1.5], position: [0, frameTop - 0.6, 0], material: 'mep' })
  groups.push({ name: 'envelope_facade', type: 'BoxGeometry', args: [width + 0.2, frameHeight, 0.2], position: [0, frameMidY, depth / 2], material: 'glass' })
  groups.push({ name: 'roof_form', type: 'BoxGeometry', args: [width, 0.4, depth], position: [0, frameTop + 0.2, 0], material: 'roofing' })
  // Secondary wing offset to the side.
  const wingH = 2 * FLOOR_HEIGHT
  groups.push({ name: 'secondary_wing', type: 'BoxGeometry', args: [26, wingH, 18], position: [width / 2 + 13, SLAB + wingH / 2, 0], material: 'concrete' })
  // Gymnasium — single-storey large volume.
  groups.push({ name: 'gymnasium_volume', type: 'BoxGeometry', args: [22, 8, 16], position: [-(width / 2 + 11), SLAB + 4, 0], material: 'concrete' })

  return { buildingType, floors: actualFloors, groups, source: 'scaffold' }
}

function scaffoldHome(buildingType: string, floors: number, width: number, depth: number): SceneGraph {
  const groups: ModelGroup[] = []
  const actualFloors = Math.min(floors, 2)

  groups.push({ name: 'foundation_slab', type: 'BoxGeometry', args: [width + 0.3, SLAB, depth + 0.3], position: [0, SLAB / 2, 0], material: 'concrete' })

  for (let i = 0; i < actualFloors; i++) {
    groups.push({ name: `floor_plate_${i + 1}`, type: 'BoxGeometry', args: [width, 0.25, depth], position: [0, SLAB + i * FLOOR_HEIGHT + 0.15, 0], material: 'concrete' })
  }

  const frameTop = SLAB + actualFloors * FLOOR_HEIGHT
  const frameHeight = frameTop - SLAB
  const frameMidY = SLAB + frameHeight / 2

  groups.push({ name: 'structural_frame', type: 'BoxGeometry', args: [width, frameHeight, depth], position: [0, frameMidY, 0], material: 'concrete' })
  groups.push({ name: 'mep_layer', type: 'BoxGeometry', args: [width - 1, 0.5, depth - 1], position: [0, frameTop - 0.4, 0], material: 'mep' })
  groups.push({ name: 'envelope_facade', type: 'BoxGeometry', args: [width + 0.1, frameHeight, 0.15], position: [0, frameMidY, depth / 2], material: 'concrete' })
  // Gable roof — two angled panels meeting at the ridge.
  const ridgeY = frameTop + 2.5
  groups.push({ name: 'roof_form', type: 'BoxGeometry', args: [width + 0.4, 0.2, depth + 0.4], rotation: [0.42, 0, 0], position: [0, ridgeY - 1, depth / 4], material: 'roofing' })
  groups.push({ name: 'roof_form_rear', type: 'BoxGeometry', args: [width + 0.4, 0.2, depth + 0.4], rotation: [-0.42, 0, 0], position: [0, ridgeY - 1, -depth / 4], material: 'roofing' })
  // Attached garage.
  groups.push({ name: 'garage_volume', type: 'BoxGeometry', args: [6, 3, 6], position: [width / 2 + 3, SLAB + 1.5, 0], material: 'concrete' })

  return { buildingType, floors: actualFloors, groups, source: 'scaffold' }
}

function scaffoldWarehouse(buildingType: string, floors: number, width: number, depth: number): SceneGraph {
  const groups: ModelGroup[] = []
  const actualFloors = Math.min(floors, 2)
  const fh = 6 // warehouses have tall single floors

  groups.push({ name: 'foundation_slab', type: 'BoxGeometry', args: [width + 0.6, SLAB, depth + 0.6], position: [0, SLAB / 2, 0], material: 'concrete' })

  for (let i = 0; i < actualFloors; i++) {
    groups.push({ name: `floor_plate_${i + 1}`, type: 'BoxGeometry', args: [width, 0.3, depth], position: [0, SLAB + i * fh + 0.15, 0], material: 'concrete' })
  }

  const frameTop = SLAB + actualFloors * fh
  const frameHeight = frameTop - SLAB
  const frameMidY = SLAB + frameHeight / 2

  groups.push({ name: 'structural_frame', type: 'BoxGeometry', args: [width, frameHeight, depth], position: [0, frameMidY, 0], material: 'steel' })
  groups.push({ name: 'mep_layer', type: 'BoxGeometry', args: [width - 2, 1.2, depth - 2], position: [0, frameTop - 0.8, 0], material: 'mep' })
  groups.push({ name: 'envelope_facade', type: 'BoxGeometry', args: [width + 0.2, frameHeight, 0.2], position: [0, frameMidY, depth / 2], material: 'concrete' })
  // Barrel ridge roof.
  groups.push({ name: 'roof_form', type: 'CylinderGeometry', args: [width / 2, width / 2, depth, 8, 1], position: [0, frameTop + 1, 0], rotation: [0, Math.PI / 2, 0], material: 'roofing' })
  // Loading dock at the rear.
  groups.push({ name: 'loading_dock', type: 'BoxGeometry', args: [14, 4, 6], position: [0, SLAB + 2, -(depth / 2 + 3)], material: 'concrete' })

  return { buildingType, floors: actualFloors, groups, source: 'scaffold' }
}

/**
 * Normalize an arbitrary parsed object (e.g. ASI:One output) into a guaranteed-
 * valid SceneGraph. Fills any missing required group from the scaffold so the
 * scene graph is always renderable and every named target resolves.
 */
export function normalizeSceneGraph(raw: unknown, idea: string): SceneGraph {
  const fallback = scaffoldRegistry(idea)
  const obj = (raw ?? {}) as Record<string, unknown>
  const rawGroups = Array.isArray(obj.groups) ? obj.groups : []

  const cleaned: ModelGroup[] = []
  for (const g of rawGroups) {
    const grp = g as Record<string, unknown>
    const name = typeof grp.name === 'string' ? grp.name : ''
    const args = Array.isArray(grp.args) ? grp.args.map(Number).filter((n) => Number.isFinite(n)) : []
    const position = Array.isArray(grp.position) ? grp.position.map(Number) : []
    if (!name || args.length < 1 || position.length !== 3 || position.some((n) => !Number.isFinite(n)))
      continue
    const type: PrimitiveType = grp.type === 'CylinderGeometry' ? 'CylinderGeometry' : 'BoxGeometry'
    cleaned.push({
      name,
      type,
      args,
      position: position as [number, number, number],
      rotation: Array.isArray(grp.rotation) && grp.rotation.length === 3
        ? (grp.rotation.map(Number) as [number, number, number])
        : undefined,
      material: typeof grp.material === 'string' ? grp.material : 'concrete',
    })
  }

  // De-duplicate by name — the LLM can emit two `structural_frame` / `envelope_
  // facade` / etc. Duplicates only stacked overlapping geometry and broke the
  // viewer's React keys + getObjectByName targeting. Keep the first occurrence.
  const seenNames = new Set<string>()
  for (let i = 0; i < cleaned.length; i++) {
    const nm = cleaned[i]!.name
    if (seenNames.has(nm)) {
      cleaned.splice(i, 1)
      i--
    } else {
      seenNames.add(nm)
    }
  }

  // Guarantee every required group exists; pull from the scaffold if missing.
  const present = new Set(cleaned.map((g) => g.name))
  for (const req of REQUIRED_GROUPS) {
    if (!present.has(req)) {
      const fb = fallback.groups.find((g) => g.name === req)
      if (fb) cleaned.push(fb)
    }
  }
  // Guarantee at least one floor plate.
  if (!cleaned.some((g) => g.name.startsWith('floor_plate_'))) {
    cleaned.push(...fallback.groups.filter((g) => g.name.startsWith('floor_plate_')))
  }

  // ASI:One authors the building, not the site — drop in the pre-made landscape
  // so generated models also sit on real grounds (unless the idea owns it).
  if (cleaned.length && wantsAutoLandscape(idea) && !hasSiteGroups(cleaned)) {
    const fp = parseIdea(idea)
    cleaned.push(...siteLandscape(fp.width, fp.depth))
  }

  const floors = Number(obj.floors)
  return {
    buildingType: typeof obj.buildingType === 'string' ? obj.buildingType : fallback.buildingType,
    floors: Number.isFinite(floors) && floors > 0 ? Math.round(floors) : fallback.floors,
    groups: cleaned.length ? cleaned : fallback.groups,
    source: typeof obj.source === 'string' ? obj.source : 'asi:one',
  }
}
