'use client'

import { SessionProvider, useSession } from 'next-auth/react'
import { useRouter, usePathname, useSelectedLayoutSegment } from 'next/navigation'
import { useEffect } from 'react'
import { needsSignIn } from '@/lib/publicPaths'
import { BrandKitDialogHost } from '@/components/brand/BrandKitDialog'
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics'
import { LastSeenPing } from '@/components/LastSeenPing'
import { Toaster, ConfirmHost } from '@/components/notices/Notices'
import { ActivityWatcher } from '@/components/notices/ActivityWatcher'

function SessionWatcher() {
  const { status, data } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  // The page really shown. While the launch countdown is up, /dashboard shows the countdown with the
  // address left as /dashboard (lib/launchGate.ts): it must not send a signed-out visitor on to sign in
  const shown = useSelectedLayoutSegment()
  const replaced = !!data?.replaced

  useEffect(() => {
    // The account signed in on another device: this one is signed out (a full page load, so the
    // route can clear the cookie)
    if (replaced) { window.location.replace('/api/auth/signed-out'); return }
    // (only from the signed-in parts of the site: an address that isn't a page stays on Page not found)
    if (status === 'unauthenticated' && needsSignIn(pathname) && shown !== 'launch') {
      router.replace('/login')
    }
  }, [status, replaced, pathname, shown, router])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // Checked every minute (and when the tab comes back into focus): a device replaced by a
    // sign-in elsewhere is signed out even while it sits idle
    <SessionProvider refetchInterval={60}>
      <SessionWatcher />
      {/* Google Analytics: only where NEXT_PUBLIC_GA_ID is set (the live site) */}
      <GoogleAnalytics />
      {/* Signed in with the site open: the admin's green "online" dot */}
      <LastSeenPing />
      {children}
      {/* Brand kits, as a popup over any page (openBrandKits) */}
      <BrandKitDialogHost />
      {/* The site's messages (components/notices): toasts at the bottom centre, askConfirm's question, and
          work that finished while you were away */}
      <Toaster />
      <ConfirmHost />
      <ActivityWatcher />
    </SessionProvider>
  )
}
