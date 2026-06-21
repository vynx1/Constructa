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
  const sessionPayload: Record<string, unknown> = {
    projectId: process.env.BROWSERBASE_PROJECT_ID!.trim(),
    proxies: opts.state
      ? [{ type: 'browserbase', geolocation: { country: 'US', state: opts.state } }]
      : true,
  }
  if (opts.advancedStealth) {
    sessionPayload.browserSettings = {
      solveCaptchas: true,
      advancedStealth: true,
    }
  }

    // advancedStealth + solveCaptchas require Browserbase's Enterprise "Verified
  // mode". On non-Enterprise plans that 403s, so degrade gracefully to basic
  // stealth + proxies (still enough for the listing-image scrape).
  let session
  try {
    session = await bb.sessions.create(sessionPayload as any)
  } catch (err) {
    const msg = (err as Error)?.message ?? ''
    if (sessionPayload.browserSettings && /Enterprise plan|Verified mode/i.test(msg)) {
      delete sessionPayload.browserSettings
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