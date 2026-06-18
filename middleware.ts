import { NextResponse, type NextRequest } from "next/server";

// Completely rewritten for Vercel Edge Runtime (final fix).
// - `createMiddlewareClient` from `@supabase/ssr` via alias on static import.
// - Top level env capture lets Next.js inline literals; runtime code has ZERO process.* or Node APIs.
// - Pure Edge cookie handling with request.cookies.
// - All auth redirect / protected route logic intact.

import { createServerClient as createMiddlewareClient } from "@supabase/ssr";

// Next.js build replaces these with string literals for the Edge bundle.
// The resulting code that actually runs in Edge contains no `process` at all.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const pathname = request.nextUrl.pathname;

  if (request.headers.get("next-action")) {
    return supabaseResponse;
  }

  // createMiddlewareClient used exactly as requested.
  const supabase = createMiddlewareClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isTempCoach = request.cookies.get("temp-coach")?.value === "1";
  if (!user && isTempCoach) {
    return supabaseResponse;
  }

  if (pathname.startsWith("/login") || pathname.startsWith("/auth")) {
    return supabaseResponse;
  }

  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/schedule") ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/roster") ||
    pathname.startsWith("/payments") ||
    pathname.startsWith("/admin");

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/admin")) {
    // ok
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|login|auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
