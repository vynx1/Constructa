// Resolve a congressional district / region id (CA-05 or legacy CA-r5) to
// metadata used by listing scrapes and mock parcel generation.

import { findDistrictById, generateStateRegions, type CongressRegion } from '~/lib/mapGeo'

export function stateCodeFromRegionId(regionId: string): string {
  const cd = regionId.match(/^([A-Z]{2})-\d{1,2}$/)
  if (cd) return cd[1]!
  const strip = regionId.match(/^([A-Z]{2})-r\d+$/)
  if (strip) return strip[1]!
  return regionId.split('-')[0]?.toUpperCase() ?? ''
}

/** Unified lookup for real CD ids and legacy strip ids. */
export function resolveRegion(regionId: string): CongressRegion | null {
  const fromCd = findDistrictById(regionId)
  if (fromCd) return fromCd
  const code = stateCodeFromRegionId(regionId)
  if (!code) return null
  return generateStateRegions(code).find((r) => r.id === regionId) ?? null
}


// Sibling congressional districts in the SAME state, nearest first (by center
// distance), excluding the region itself. Used to borrow live listing imagery
// when a district has no specific properties of its own.
export function nearbyRegionIds(regionId: string, limit = 4): string[] {
  const self = resolveRegion(regionId)
  const code = stateCodeFromRegionId(regionId)
  if (!self || !code) return []
  const [lng, lat] = self.center
  return generateStateRegions(code)
    .filter((r) => r.id !== self.id)
    .map((r) => ({ id: r.id, d: (r.center[0] - lng) ** 2 + (r.center[1] - lat) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((r) => r.id)
}
