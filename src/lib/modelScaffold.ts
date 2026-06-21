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

/**
 * Build a complete, valid scene graph from an idea string using only the
 * constrained primitive library. Always produces every required group so the
 * viewer + timeline targeting never breaks.
 *
 * Building types produce geometrically distinct models — not just resized boxes.
 */
export function scaffoldRegistry(idea: string): SceneGraph {
  const { buildingType, floors, width, depth } = parseIdea(idea)

  if (buildingType === 'parking structure') return scaffoldParking(buildingType, floors, width, depth)
  if (buildingType === 'luxury penthouse tower') return scaffoldPenthouse(buildingType, floors, width, depth)
  if (buildingType === 'school campus') return scaffoldSchool(buildingType, floors, width, depth)
  if (buildingType === 'single-family home') return scaffoldHome(buildingType, floors, width, depth)
  if (buildingType === 'warehouse') return scaffoldWarehouse(buildingType, floors, width, depth)
  return scaffoldGeneric(buildingType, floors, width, depth)
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

  const floors = Number(obj.floors)
  return {
    buildingType: typeof obj.buildingType === 'string' ? obj.buildingType : fallback.buildingType,
    floors: Number.isFinite(floors) && floors > 0 ? Math.round(floors) : fallback.floors,
    groups: cleaned.length ? cleaned : fallback.groups,
    source: typeof obj.source === 'string' ? obj.source : 'asi:one',
  }
}
