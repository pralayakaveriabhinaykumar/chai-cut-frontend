import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BrandLogo } from '@/components/ui/brand-logo'
import { launchSettings } from '@/server/services/launchSettings'
import { Countdown } from './Countdown'
import './launch.css'

// The launch countdown (lib/launchGate.ts): every page shows this until LAUNCH_AT, with the address left
// as typed. Made fresh on every visit: the time left must come from now, not from the build.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Shortcut — launching soon',
  description: 'Transcribe, clip, and edit vertical videos in Telugu, Hindi, and Hinglish.',
  // (not kept by search engines as the homepage: the real one is back after the launch)
  robots: { index: false, follow: false },
}

const istDate = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric',
})
const istTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
})

export default async function LaunchPage() {
  // (the admin's Launch page, else LAUNCH_AT)
  const { at } = await launchSettings()
  // No launch time set: the middleware never shows this page, so an address typed by hand goes home
  if (at === null) redirect('/')

  return (
    <main className="ln-root">
      <div className="ln-glow" aria-hidden />
      <header className="ln-top">
        <BrandLogo shine />
      </header>

      <section className="ln-center">
        <p className="ln-eyebrow">Launching in</p>
        <Countdown launchAt={at} serverNow={Date.now()} />
        <p className="ln-when">
          <time dateTime={new Date(at).toISOString()}>
            {istDate.format(at)} <span className="ln-dot" aria-hidden>·</span> {istTime.format(at).toLowerCase()} IST
          </time>
        </p>
        <p className="ln-tagline">Transcribe, clip, and edit vertical videos in Telugu, Hindi, and Hinglish.</p>
      </section>

      {/* Razorpay's website review opens these signed out: they stay reachable during the countdown */}
      <footer className="ln-foot">
        <Link href="/pricing">Pricing</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/refunds">Refunds</Link>
        <Link href="/support">Support</Link>
      </footer>
    </main>
  )
}
