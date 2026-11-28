'use client'

import { useEffect, useRef, useState } from 'react'
import { splitLeft } from '@/lib/launchGate'

const pad = (n: number) => String(n).padStart(2, '0')

/** One number of the timer: each digit slides in when it changes (a new key → the CSS animation plays) */
function Unit({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  const digits = pad(value).split('')
  return (
    <div className={`ln-unit${accent ? ' ln-unit-accent' : ''}`}>
      <div className="ln-digits" aria-hidden>
        {digits.map((d, i) => (
          <span className="ln-digit" key={`${digits.length - i}-${d}`}>{d}</span>
        ))}
      </div>
      <div className="ln-label" aria-hidden>{label}</div>
    </div>
  )
}

// How often an open countdown asks the server again (the launch may have been moved meanwhile)
const RESYNC_MS = 5 * 60 * 1000

/**
 * Counts down to the launch on the SERVER's clock, so a phone set to the wrong time still shows the right
 * count and every device reaches zero together:
 * - first guess: the server's time written into the page (late by however long the page took to load)
 * - then /api/launch-time, timed there and back (half the round trip added), which corrects it
 * - asked again every few minutes: a launch moved meanwhile reloads the page
 * At zero it says "We're live" and reloads: the site is open by then (the middleware checks the same time).
 */
export function Countdown({ launchAt, serverNow }: { launchAt: number; serverNow: number }) {
  const [left, setLeft] = useState(() => launchAt - serverNow)
  // Already zero when the page came: no automatic reload (a reload that still showed the countdown would
  // loop), just a link
  const startedLive = useRef(launchAt - serverNow <= 0)
  // server clock − this device's clock
  const offset = useRef<number | null>(null)
  const firstServerNow = useRef(serverNow)

  useEffect(() => {
    if (offset.current === null) offset.current = firstServerNow.current - Date.now()
    let stopped = false
    const tick = () => setLeft(launchAt - (Date.now() + (offset.current ?? 0)))

    const sync = async () => {
      try {
        const sent = Date.now()
        const res = await fetch('/api/launch-time', { cache: 'no-store' })
        const back = Date.now()
        const body = await res.json() as { now?: unknown; at?: unknown }
        if (stopped || typeof body.now !== 'number') return
        // The launch was moved (or opened early): the fresh page shows the new count, or the site
        if (body.at !== launchAt) { window.location.reload(); return }
        offset.current = body.now + (back - sent) / 2 - back
        tick()
      } catch { /* offline for a moment: keep the last guess */ }
    }

    tick()
    sync()
    const tickId = setInterval(tick, 250)
    const syncId = setInterval(sync, RESYNC_MS)
    return () => { stopped = true; clearInterval(tickId); clearInterval(syncId) }
  }, [launchAt])

  const t = splitLeft(left)
  const live = t.total === 0

  useEffect(() => {
    if (!live || startedLive.current) return
    const id = setTimeout(() => window.location.reload(), 1600)
    return () => clearTimeout(id)
  }, [live])

  if (live) {
    return (
      <div className="ln-live" role="status">
        <p className="ln-live-title">We&rsquo;re live</p>
        <a className="ln-live-link" href="/">Open Shortcut</a>
      </div>
    )
  }

  const spoken = `${t.days} days, ${t.hours} hours, ${t.minutes} minutes left`
  return (
    <div className="ln-timer" role="timer" aria-label={spoken}>
      <Unit value={t.days} label={t.days === 1 ? 'Day' : 'Days'} />
      <span className="ln-sep" aria-hidden>:</span>
      <Unit value={t.hours} label="Hours" />
      <span className="ln-sep" aria-hidden>:</span>
      <Unit value={t.minutes} label="Minutes" />
      <span className="ln-sep" aria-hidden>:</span>
      <Unit value={t.seconds} label="Seconds" accent />
    </div>
  )
}
