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
