import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])
// Only the root onboarding selector — not sub-pages like /onboarding/integrations
const isOnboardingRoot = createRouteMatcher(['/onboarding'])
const isAnyOnboardingRoute = createRouteMatcher(['/onboarding(.*)'])
const isApiRoute = createRouteMatcher(['/api/(.*)'])
const isDashboardRoute = createRouteMatcher(['/', '/chat(.*)', '/insights(.*)', '/briefing(.*)', '/admin(.*)', '/agents(.*)', '/sources(.*)', '/integrations(.*)', '/teams(.*)', '/settings(.*)'])

export default clerkMiddleware(async (auth, req) => {
    // Public routes: no auth checks needed
    if (isPublicRoute(req)) return

    const { userId, orgId } = await auth()

    // Not signed in → redirect to sign-in
    if (!userId) {
        return NextResponse.redirect(new URL('/sign-in', req.url))
    }

    // API routes: just verify auth, no redirect logic
    if (isApiRoute(req)) return

    if (!isDashboardRoute(req) && !isAnyOnboardingRoute(req)) return

    // Signed in, no active org → must complete onboarding
    if (!orgId && !isAnyOnboardingRoute(req)) {
        return NextResponse.redirect(new URL('/onboarding', req.url))
    }

    // Has an org but hits the root /onboarding selector → send to dashboard
    // Sub-pages like /onboarding/integrations remain accessible (admin setup flow)
    if (orgId && isOnboardingRoot(req)) {
        return NextResponse.redirect(new URL('/', req.url))
    }
})

export const config = {
    matcher: [
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        '/(api|trpc)(.*)',
    ],
}
