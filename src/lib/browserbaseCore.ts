// Single Browserbase entrypoint — cloud Chromium + residential/geo proxies + CDP.

export interface BrowserbasePageOptions {
  /** US state code (e.g. CA) for geo-targeted proxy routing on Zillow etc. */
  state?: string
  advancedStealth?: boolean
}

export function hasBrowserbaseKey(): boolean {
  return Boolean(
    process.env.BROWSERBASE_API_KEY?.trim() &&
      process.env.BROWSERBASE_PROJECT_ID?.trim(),
  )
}

export async function withBrowserbasePage<T>(
  fn: (page: any) => Promise<T>,
  opts: BrowserbasePageOptions = {},
): Promise<T> {
  const { default: Browserbase } = await import('@browserbasehq/sdk')
  const { chromium } = await import('playwright-core')

  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY!.trim() })
  // Developer-plan features (no Enterprise needed): geo/residential proxies,
  // realistic device FINGERPRINT (defeats most bot heuristics on Google/Bing),
  // ad/tracker blocking (faster page loads), and a desktop viewport.
  const baseBrowserSettings: Record<string, unknown> = {
    blockAds: true,
    viewport: { width: 1366, height: 900 },
    fingerprint: {
      devices: ['desktop'],
      locales: ['en-US'],
      operatingSystems: ['windows'],
    },
  }
  const sessionPayload: Record<string, unknown> = {
    projectId: process.env.BROWSERBASE_PROJECT_ID!.trim(),
    proxies: opts.state
      ? [{ type: 'browserbase', geolocation: { country: 'US', state: opts.state } }]
      : true,
    browserSettings: opts.advancedStealth
      ? { ...baseBrowserSettings, solveCaptchas: true, advancedStealth: true }
      : baseBrowserSettings,
  }

  // advancedStealth + solveCaptchas require Browserbase's Enterprise "Verified
  // mode". On non-Enterprise plans that 403s, so degrade gracefully to basic
  // stealth (fingerprint + proxies stay on — still defeats most detection).
  let session
  try {
    session = await bb.sessions.create(sessionPayload as any)
  } catch (err) {
    const msg = (err as Error)?.message ?? ''
    if (opts.advancedStealth && /Enterprise plan|Verified mode/i.test(msg)) {
      sessionPayload.browserSettings = baseBrowserSettings
      session = await bb.sessions.create(sessionPayload as any)
    } else {
      throw err
    }
  }
  const browser = await chromium.connectOverCDP(session.connectUrl)
  try {
    const ctx = browser.contexts()[0]
    const page = ctx?.pages()[0] ?? (await ctx!.newPage())
    return await fn(page)
  } finally {
    await browser.close().catch(() => {})
  }
}

/** Navigate and let lazy/responsive images resolve their currentSrc. */
export async function gotoAndSettle(
  page: any,
  url: string,
  settleMs = 4000,
): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.waitForTimeout(settleMs)
}

/** Navigate and wait for a specific selector (search result pages). Returns true
 * if the selector appeared before timeout, false otherwise (caller can fall back). */
export async function gotoAndWait(
  page: any,
  url: string,
  selector: string,
  timeoutMs = 9000,
): Promise<boolean> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  try {
    await page.waitForSelector(selector, { timeout: timeoutMs })
    return true
  } catch {
    return false
  }
}
