import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gateAllows, gateDecision, isGated, parseLaunchAt, splitLeft, LAUNCH_PAGE } from './launchGate'

const AT = Date.parse('2026-12-20T18:00:00+05:30')
const BEFORE = AT - 60_000
const AFTER = AT + 1

test('LAUNCH_AT: with a zone, without one (India time), a date alone, and unreadable', () => {
  assert.equal(parseLaunchAt('2026-12-20T18:00:00+05:30'), AT)
  assert.equal(parseLaunchAt('2026-12-20T12:30:00Z'), AT)
  // no zone → IST, not the server's clock (UTC on Railway)
  assert.equal(parseLaunchAt('2026-12-20T18:00'), AT)
  assert.equal(parseLaunchAt('2026-12-20 18:00'), AT)
  assert.equal(parseLaunchAt('  2026-12-20T18:00:00+0530 '), AT)
  assert.equal(parseLaunchAt('2026-12-20'), Date.parse('2026-12-20T00:00+05:30'))
  // a typo must not close a live site
  for (const bad of [undefined, null, '', '   ', 'soon', '20/12/2026']) assert.equal(parseLaunchAt(bad), null, String(bad))
})

test('gated only before the launch moment, never without one', () => {
  assert.equal(isGated(AT, BEFORE), true)
  assert.equal(isGated(AT, AT), false)
  assert.equal(isGated(AT, AFTER), false)
  assert.equal(isGated(null, BEFORE), false)
})

test('while gated: pages show the countdown; API, price and legal pages and files stay open', () => {
  for (const p of ['/', '/dashboard', '/editor/abc', '/login', '/signup', '/videos/1/clips', '/billing', '/abc', '/guide']) {
    assert.equal(gateDecision({ pathname: p, now: BEFORE, at: AT }), 'countdown', p)
  }
  for (const p of ['/api/billing/webhook', '/api/auth/session', '/api/videos/1', '/pricing', '/refunds', '/privacy',
    '/terms', '/support', '/delete-account', '/restore-account', LAUNCH_PAGE, '/robots.txt', '/.well-known/x']) {
    assert.equal(gateDecision({ pathname: p, now: BEFORE, at: AT }), 'pass', p)
    assert.equal(gateAllows(p), true, p)
  }
  // look-alikes are not let through
  for (const p of ['/pricingx', '/apis', '/terms-old']) assert.equal(gateAllows(p), false, p)
})

test('after the launch (or with no launch set) everything opens; /launch goes home', () => {
  for (const at of [AT, null]) {
    const now = at === null ? BEFORE : AFTER
    for (const p of ['/', '/dashboard', '/login']) assert.equal(gateDecision({ pathname: p, now, at }), 'pass', p)
    assert.equal(gateDecision({ pathname: LAUNCH_PAGE, now, at }), 'to-home')
  }
})

test('team preview: the right key sets the cookie, the cookie opens everything, wrong or empty keys do nothing', () => {
  const key = 'k3y-secret'
  assert.equal(gateDecision({ pathname: '/', now: BEFORE, at: AT, previewKey: key, previewParam: key }), 'set-preview')
  assert.equal(gateDecision({ pathname: '/dashboard', now: BEFORE, at: AT, previewKey: key, previewCookie: key }), 'pass')
  assert.equal(gateDecision({ pathname: '/dashboard', now: BEFORE, at: AT, previewKey: key, previewParam: 'nope' }), 'countdown')
  assert.equal(gateDecision({ pathname: '/dashboard', now: BEFORE, at: AT, previewKey: key, previewCookie: 'old-key' }), 'countdown')
  // no key set on the server: an empty param or cookie must not match
  for (const previewKey of [undefined, '', '  ']) {
    assert.equal(gateDecision({ pathname: '/', now: BEFORE, at: AT, previewKey, previewParam: '', previewCookie: '' }), 'countdown')
  }
  // after the launch the key changes nothing
  assert.equal(gateDecision({ pathname: '/', now: AFTER, at: AT, previewKey: key, previewParam: key }), 'pass')
})

test('time left splits into days / hours / minutes / seconds and reaches zero exactly at the launch', () => {
  assert.deepEqual(splitLeft((2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000), { total: 183845, days: 2, hours: 3, minutes: 4, seconds: 5 })
  // 0.2 s left still shows 1 second: zero only when the moment has come
  assert.equal(splitLeft(200).seconds, 1)
  assert.deepEqual(splitLeft(0), { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 })
  assert.equal(splitLeft(-5000).total, 0)
})
