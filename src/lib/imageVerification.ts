// Gate listing photos through provenance checks + lightweight reachability before UI.

import {
  isListingCdnUrl,
  type ImageProvenance,
  type ImageSourceSite,
} from '~/lib/imageProvenance'

const BLOCKED_HOSTS = ['picsum.photos', 'placeholder.com', 'via.placeholder.com']

export function isBlockedImageUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return BLOCKED_HOSTS.some((b) => host.includes(b))
  } catch {
    return true
  }
}

async function reachableImage(url: string): Promise<boolean> {
  if (isBlockedImageUrl(url)) return false
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(8_000),
      headers: { 'user-agent': 'Constructa-ImageVerifier/1.0' },
    })
    if (!res.ok) return false
    const ct = res.headers.get('content-type') ?? ''
    return ct.startsWith('image/') || ct.includes('octet-stream')
  } catch {
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(8_000),
        headers: { 'user-agent': 'Constructa-ImageVerifier/1.0', range: 'bytes=0-512' },
      })
      const ct = res.headers.get('content-type') ?? ''
      return res.ok && (ct.startsWith('image/') || ct.includes('octet-stream'))
    } catch {
      return false
    }
  }
}

/** Verify URLs: provenance guard + network reachability. Never passes picsum. */
export async function verifyListingImages(
  urls: string[],
  sourceSite: ImageSourceSite,
  sourcePageUrl = '',
): Promise<{ verified: string[]; provenance: ImageProvenance[] }> {
  const unique = [...new Set(urls.map((u) => u.split('?')[0]!))]
  const verified: string[] = []
  const provenance: ImageProvenance[] = []
  const scrapedAt = new Date().toISOString()

  for (const url of unique) {
    if (!isListingCdnUrl(url, sourceSite) && sourceSite !== 'duckduckgo') continue
    if (sourceSite === 'duckduckgo' && isBlockedImageUrl(url)) continue
    if (!(await reachableImage(url))) continue
    verified.push(url)
    provenance.push({ url, sourceSite, sourcePageUrl, scrapedAt })
    if (verified.length >= 6) break
  }

  return { verified, provenance }
}
