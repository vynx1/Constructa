// USPS state code ↔ Census FIPS (used to filter us-atlas TopoJSON).

export const STATE_TO_FIPS: Record<string, string> = {
  AL: '01',
  AK: '02',
  AZ: '04',
  AR: '05',
  CA: '06',
  CO: '08',
  CT: '09',
  DE: '10',
  FL: '12',
  GA: '13',
  HI: '15',
  ID: '16',
  IL: '17',
  IN: '18',
  IA: '19',
  KS: '20',
  KY: '21',
  LA: '22',
  ME: '23',
  MD: '24',
  MA: '25',
  MI: '26',
  MN: '27',
  MS: '28',
  MO: '29',
  MT: '30',
  NE: '31',
  NV: '32',
  NH: '33',
  NJ: '34',
  NM: '35',
  NY: '36',
  NC: '37',
  ND: '38',
  OH: '39',
  OK: '40',
  OR: '41',
  PA: '42',
  RI: '44',
  SC: '45',
  SD: '46',
  TN: '47',
  TX: '48',
  UT: '49',
  VT: '50',
  VA: '51',
  WA: '53',
  WV: '54',
  WI: '55',
  WY: '56',
  DC: '11',
}

const FIPS_TO_STATE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_TO_FIPS).map(([code, fips]) => [fips, code]),
)

export function fipsForState(code: string): string | undefined {
  return STATE_TO_FIPS[code.toUpperCase()]
}

export function stateForFips(fips: string): string | undefined {
  return FIPS_TO_STATE[fips.padStart(2, '0')]
}

/** Parse us-atlas congressional district id (e.g. "0605" → CA district 5). */
export function parseDistrictId(atlasId: string): { code: string; number: number } | null {
  const id = atlasId.padStart(4, '0')
  const fips = id.slice(0, 2)
  const num = parseInt(id.slice(2), 10)
  const code = stateForFips(fips)
  if (!code || !Number.isFinite(num)) return null
  return { code, number: num }
}

export function districtId(code: string, number: number): string {
  return `${code.toUpperCase()}-${String(number).padStart(2, '0')}`
}
