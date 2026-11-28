import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

// The launch countdown's settings from the admin (launch_settings) and the env before the admin has saved any;
// the gate's decision with them. Real Postgres (no tables needed: it makes its own):
//   DATABASE_URL=… DB_SSL=off npx tsx --test src/server/services/launchSettings.test.ts
const HAS_DB = !!process.env.DATABASE_URL
const opts = { skip: HAS_DB ? false : 'DATABASE_URL not set' }

let sql: typeof import('@/lib/db').default
let ls: typeof import('./launchSettings')
let gate: typeof import('@/lib/launchGate')

before(async () => {
  if (!HAS_DB) return
  sql = (await import('@/lib/db')).default
  ls = await import('./launchSettings')
  gate = await import('@/lib/launchGate')
  await sql.unsafe(ls.LAUNCH_SCHEMA)
  await sql`DELETE FROM launch_settings`
})
after(async () => {
  if (!HAS_DB) return
  await sql`DELETE FROM launch_settings`
  delete process.env.LAUNCH_AT; delete process.env.LAUNCH_PREVIEW_KEY
  await sql.end()
})

test('no row yet: the env decides (LAUNCH_AT, LAUNCH_PREVIEW_KEY), or nothing', opts, async () => {
  delete process.env.LAUNCH_AT; delete process.env.LAUNCH_PREVIEW_KEY
  ls.forgetLaunchSettings()
  assert.deepEqual(await ls.launchSettings(), { at: null, previewKey: null, source: 'env' })
  process.env.LAUNCH_AT = '2030-01-01T18:00'
  process.env.LAUNCH_PREVIEW_KEY = ' team-key '
  ls.forgetLaunchSettings()
  assert.deepEqual(await ls.launchSettings(), { at: Date.parse('2030-01-01T18:00+05:30'), previewKey: 'team-key', source: 'env' })
})

test('the admin\'s row wins over the env: a time, a moved time, opened now (NULL), its own key', opts, async () => {
  process.env.LAUNCH_AT = '2030-01-01T18:00'
  process.env.LAUNCH_PREVIEW_KEY = 'env-key'
  const at = Date.now() + 3_600_000
  await sql`INSERT INTO launch_settings (id, launch_at, preview_key, updated_by) VALUES (1, ${new Date(at)}, 'admin-key', 'a@test')`
  ls.forgetLaunchSettings()
  assert.deepEqual(await ls.launchSettings(), { at, previewKey: 'admin-key', source: 'admin' })
  // the gate with it: closed, the admin's key lets the team in, the env's no longer does
  const s = await ls.launchSettings()
  const base = { pathname: '/dashboard', now: Date.now(), at: s.at, previewKey: s.previewKey }
  assert.equal(gate.gateDecision(base), 'countdown')
  assert.equal(gate.gateDecision({ ...base, previewCookie: 'admin-key' }), 'pass')
  assert.equal(gate.gateDecision({ ...base, previewCookie: 'env-key' }), 'countdown')
  // "Open the site now": the row stays with no time, and the env's time is not used again
  await sql`UPDATE launch_settings SET launch_at = NULL, preview_key = NULL`
  ls.forgetLaunchSettings()
  const open = await ls.launchSettings()
  assert.deepEqual(open, { at: null, previewKey: null, source: 'admin' })
  assert.equal(gate.gateDecision({ ...base, at: open.at }), 'pass')
})

test('kept for a few seconds: a change shows after CACHE_MS, not on every request', opts, async () => {
  const at = Date.now() + 7_200_000
  await sql`UPDATE launch_settings SET launch_at = ${new Date(at)}`
  ls.forgetLaunchSettings()
  assert.equal((await ls.launchSettings()).at, at)
  await sql`UPDATE launch_settings SET launch_at = NULL`
  // (still the kept one)
  assert.equal((await ls.launchSettings()).at, at)
  // many requests at once: one read
  const all = await Promise.all(Array.from({ length: 20 }, () => ls.launchSettings()))
  assert.ok(all.every(v => v.at === at))
  ls.forgetLaunchSettings()
  assert.equal((await ls.launchSettings()).at, null)
  assert.ok(ls.CACHE_MS <= 30_000)
})
