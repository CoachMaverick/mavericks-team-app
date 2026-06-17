import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

// Proper matcher that runs middleware on (almost) all routes, but we explicitly allow/skip
// auth routes inside updateSession so that /auth/confirm and /auth/callback can handle
// verifyOtp / exchangeCodeForSession without being redirected or having getUser() interfere.
export const config = {
  matcher: [
    /*
     * Exclude static files, images, and auth-related routes from middleware.
     * This ensures /login, /auth/confirm, /auth/callback etc. are reached directly
     * by the route handlers (for verifyOtp / exchangeCodeForSession) without
     * middleware's getUser() or redirect logic interfering.
     * This is critical to avoid "invalid path specified in request url" and
     * other auth flow issues with Supabase magic links / email confirmations.
     */
    '/((?!_next/static|_next/image|favicon.ico|api|login|auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
