import { NextResponse, type NextRequest } from "next/server";

/**
 * TEMPORARY WORKAROUND for Vercel Edge Runtime / MIDDLEWARE_INVOCATION_FAILED.
 *
 * This middleware now does NOTHING — it simply passes every request through.
 * All Supabase auth checks, protected route redirects, and cookie handling
 * have been bypassed so the app can load.
 *
 * Auth / protected routes will need to be re-enabled later (in layout, pages,
 * or a fixed middleware).
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

// Matcher kept similar to before so middleware still "runs" on app routes
// (but does nothing). Adjust if you want it to run on fewer paths.
export const config = {
  matcher: [
    /*
     * Exclude static files, images, and auth-related routes (even though
     * we do nothing now, this keeps the surface area similar).
     */
    '/((?!_next/static|_next/image|favicon.ico|api|login|auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
