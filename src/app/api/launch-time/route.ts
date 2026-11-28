import { launchSettings } from '@/server/services/launchSettings'

// The launch countdown's clock (app/launch/Countdown.tsx): the server's time now and the launch moment,
// so every device counts the same seconds whatever its own clock says. (The API stays open during the
// countdown, lib/launchGate.ts; the launch time is on the page anyway.)
export const dynamic = 'force-dynamic'

export async function GET() {
  // (the admin's Launch page, else LAUNCH_AT: a time moved there reloads open countdowns)
  const { at } = await launchSettings()
  return Response.json({ now: Date.now(), at }, { headers: { 'Cache-Control': 'no-store' } })
}
