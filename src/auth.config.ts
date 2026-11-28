import type { NextAuthConfig } from 'next-auth'
import { NextResponse } from 'next/server'
import { isAuthPage, needsSignIn } from './lib/publicPaths'
import { gateDecision, LAUNCH_PAGE, PREVIEW_COOKIE, PREVIEW_DAYS, PREVIEW_PARAM } from './lib/launchGate'
import { launchSettings } from './server/services/launchSettings'

export const authConfig = {
  // AUTH_TRUST_HOST isn't reliably picked up on Railway (vs. Vercel, which sets it for you) —
  // set it directly so both middleware (edge) and auth.ts (node) trust the deployed host.
  trustHost: true,
  pages: {
    signIn: '/login',
    // (a Google sign-in that didn't finish comes back to the form, which says why: ?error=…)
    error: '/login',
  },
  callbacks: {
    async authorized({ auth, request }) {
      const { nextUrl } = request
      const isLoggedIn = !!auth?.user
      const { pathname } = nextUrl

      // Launch countdown (lib/launchGate.ts): before LAUNCH_AT every page shows the countdown, signed in
      // or not; checked before the sign-in rules so nobody is sent to a sign-in page they can't open.
      // The time and key come from the admin's Launch page (launch_settings), else LAUNCH_AT / LAUNCH_PREVIEW_KEY
      const launch = await launchSettings()
      const previewKey = launch.previewKey
      const gate = gateDecision({
        pathname,
        now: Date.now(),
        at: launch.at,
        previewParam: nextUrl.searchParams.get(PREVIEW_PARAM),
        previewCookie: request.cookies.get(PREVIEW_COOKIE)?.value,
        previewKey,
      })
      if (gate === 'countdown') return NextResponse.rewrite(new URL(LAUNCH_PAGE, nextUrl))
      if (gate === 'to-home') return NextResponse.redirect(new URL('/', nextUrl))
      if (gate === 'set-preview' && previewKey) {
        const clean = nextUrl.clone()
        clean.searchParams.delete(PREVIEW_PARAM)
        const res = NextResponse.redirect(clean)
        res.cookies.set(PREVIEW_COOKIE, previewKey.trim(), {
          httpOnly: true,
          secure: nextUrl.protocol === 'https:',
          sameSite: 'lax',
          path: '/',
          maxAge: PREVIEW_DAYS * 24 * 60 * 60,
        })
        return res
      }

      // Signed out: sent to sign in only from the signed-in parts of the site. Public pages, the
      // sign-in pages and the API pass (the API checks for itself), and so does an address that isn't
      // a page, which shows Page not found (F2 bug 9: it used to show the sign-in page)
      if (!isLoggedIn && needsSignIn(pathname)) return false
      if (isLoggedIn && isAuthPage(pathname)) return Response.redirect(new URL('/dashboard', nextUrl))
      return true
    },
  },
  providers: [],
} satisfies NextAuthConfig
