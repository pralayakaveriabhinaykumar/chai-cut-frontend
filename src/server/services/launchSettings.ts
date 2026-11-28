import sql from '@/lib/db'
import { launchAt as envLaunchAt } from '@/lib/launchGate'

// The launch countdown's settings (lib/launchGate.ts), set from the admin (Shortcut-Admin-f, Launch page) so
// the time can be moved, the site opened early or the preview key changed without a deploy (2026-11-28).
//
// One row in launch_settings. Once the admin has saved it, the row decides: launch_at NULL = no countdown.
// Before that (no row: QA, local, a fresh database) the env decides as before: LAUNCH_AT, LAUNCH_PREVIEW_KEY.
//
// Every request through the middleware asks, so the row is kept for CACHE_MS: a change from the admin
// reaches the site within that (and an open countdown reloads itself when the time moves: /api/launch-time).
// The database not answering never closes the site by surprise: the last row read is kept, or else the env.

export interface LaunchSettings {
  /** The launch moment (ms), or null: no countdown */
  at: number | null
  /** The team's way in before it (?preview=…), or null: none */
  previewKey: string | null
  /** Where it came from: the admin's row, or the env (no row yet) */
  source: 'admin' | 'env'
}

export const CACHE_MS = 15_000
/** Longer than this and the request goes on with what is kept (a slow database must not hold up every page) */
const READ_TIMEOUT_MS = 2_000

/** The same table the admin makes (Shortcut-Admin-f server/admin/launch.ts) */
export const LAUNCH_SCHEMA = `CREATE TABLE IF NOT EXISTS launch_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  launch_at TIMESTAMPTZ,
  preview_key TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
)`

const fromEnv = (): LaunchSettings => ({ at: envLaunchAt(), previewKey: process.env.LAUNCH_PREVIEW_KEY?.trim() || null, source: 'env' })

let kept: { v: LaunchSettings; t: number } | null = null
let loading: Promise<LaunchSettings> | null = null
let schema: Promise<unknown> | null = null

async function read(): Promise<LaunchSettings> {
  schema ??= sql.unsafe(LAUNCH_SCHEMA).catch(e => { schema = null; throw e })
  await schema
  const [r] = await sql<{ launch_at: Date | null; preview_key: string | null }[]>`SELECT launch_at, preview_key FROM launch_settings WHERE id = 1`
  return r ? { at: r.launch_at ? r.launch_at.getTime() : null, previewKey: r.preview_key?.trim() || null, source: 'admin' } : fromEnv()
}

/** The launch settings now (kept for CACHE_MS) */
export async function launchSettings(): Promise<LaunchSettings> {
  if (kept && Date.now() - kept.t < CACHE_MS) return kept.v
  loading ??= (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const v = await Promise.race([
        read(),
        new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error('timed out')), READ_TIMEOUT_MS) }),
      ])
      kept = { v, t: Date.now() }
      return v
    } catch (e) {
      // (kept as it was, so the next request tries again)
      console.warn(`[launch] couldn't read launch_settings (${(e as Error)?.message ?? e}): ${kept ? 'keeping the last one read' : 'using the env'}`)
      return kept?.v ?? fromEnv()
    } finally {
      clearTimeout(timer)
      loading = null
    }
  })()
  return loading
}

/** Forget the kept row (tests) */
export function forgetLaunchSettings() { kept = null; loading = null }
