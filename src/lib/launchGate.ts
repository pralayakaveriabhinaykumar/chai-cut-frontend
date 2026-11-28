// Launch countdown (2026-11-28): until LAUNCH_AT, every page of the site shows only the countdown
// (app/launch), the address staying as typed. At that moment the site opens by itself, with no deploy.
// LAUNCH_AT not set (QA, local) or already past → no gate, the site as before.
//
// Still open while gated:
// - the API: the Razorpay webhook, the worker's calls and sign-in must keep working (each route checks
//   for itself, and nobody can reach the pages anyway)
// - the price and legal pages: Razorpay's website review opens them signed out, and payments are blocked
//   from a site it can't check (publicPaths.ts)
// - the account-restore page, so a restore link in an email still works
// - files (robots.txt, .well-known/…): addresses with a dot in the last part
//
// The team gets in with ?preview=<LAUNCH_PREVIEW_KEY> once: a cookie for 30 days, then the whole site works.
// Changing the key locks every preview out again.
//
// Pure functions (no Next imports): used by the middleware (auth.config.ts) and the countdown page.

export const LAUNCH_PAGE = '/launch'
export const PREVIEW_PARAM = 'preview'
export const PREVIEW_COOKIE = 'sc_launch_preview'
export const PREVIEW_DAYS = 30

const OPEN_WHILE_GATED = [
  '/pricing', '/refunds', '/privacy', '/terms', '/support', '/delete-account', '/restore-account',
  LAUNCH_PAGE,
]

const under = (pathname: string, area: string) => pathname === area || pathname.startsWith(`${area}/`)

/**
 * LAUNCH_AT as a moment, or null (no gate). A time without a zone is taken as India time, so
 * "2026-12-20T18:00" means 6 pm IST, not 6 pm on the server's clock (UTC on Railway). A value that
 * can't be read opens the site (null): a typo must not close a live site.
 */
export function parseLaunchAt(raw: string | undefined | null): number | null {
  let s = raw?.trim()
  if (!s) return null
  s = s.replace(' ', 'T')
  // (a date alone: midnight IST)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00'
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s += '+05:30'
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

let warned = false
/** The launch moment from the env, or null */
export function launchAt(): number | null {
  const raw = process.env.LAUNCH_AT
  const at = parseLaunchAt(raw)
  if (raw?.trim() && at === null && !warned) {
    warned = true
    console.warn(`[launch] LAUNCH_AT="${raw}" can't be read as a time: the site stays open`)
  }
  return at
}

export const isGated = (at: number | null, now: number): at is number => at !== null && now < at

/** Whether this address opens normally while the countdown is up */
export function gateAllows(pathname: string): boolean {
  if (under(pathname, '/api') || under(pathname, '/.well-known')) return true
  const last = pathname.slice(pathname.lastIndexOf('/') + 1)
  if (last.includes('.')) return true
  return OPEN_WHILE_GATED.some(p => under(pathname, p))
}

export type GateDecision =
  | 'pass'          // the page as usual
  | 'countdown'     // show the countdown instead (address unchanged)
  | 'set-preview'   // right preview key: set the cookie, reload without ?preview
  | 'to-home'       // /launch after the launch: go to the homepage

export function gateDecision(input: {
  pathname: string
  now: number
  at: number | null
  /** ?preview=… on this request */
  previewParam?: string | null
  /** the preview cookie on this request */
  previewCookie?: string | null
  /** LAUNCH_PREVIEW_KEY */
  previewKey?: string | null
}): GateDecision {
  const { pathname, now, at } = input
  if (!isGated(at, now)) return pathname === LAUNCH_PAGE ? 'to-home' : 'pass'
  const key = input.previewKey?.trim()
  if (key && input.previewParam === key) return 'set-preview'
  if (key && input.previewCookie === key) return 'pass'
  return gateAllows(pathname) ? 'pass' : 'countdown'
}

/** Days / hours / minutes / seconds left, from milliseconds (0 or less → all zero) */
export function splitLeft(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return {
    total,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}
