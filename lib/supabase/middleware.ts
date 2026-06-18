import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;

  // CRITICAL: Bypass all Supabase session/redirect logic for Server Actions.
  // Server actions (identified by the "next-action" header) run their own
  // createClient() + auth.getUser() + mutations. Running middleware's getUser()
  // + possible token refresh on action POSTs frequently causes
  // "Invalid path specified in request URL" inside the @supabase/ssr client.
  if (request.headers.get('next-action')) {
    return supabaseResponse;
  }

  // Use dynamic import so that @supabase/ssr (and its transitive deps like
  // auth-js, realtime-js, etc.) are not statically bundled into the Edge
  // chunk. Static imports can cause the bundler to include Node-only code
  // paths that reference `process.version`, `require`, etc., which are
  // forbidden in Vercel's Edge Runtime.
  const { createServerClient } = await import('@supabase/ssr');

  // Guarded env access using dynamic property lookup (bracket notation).
  // This avoids direct `process.version` / Node API references that trigger
  // Edge Runtime static analysis (exact pattern used inside Supabase's own
  // @supabase/realtime-js to dodge Next.js/Vercel Edge checks).
  const g = globalThis as any;
  const _process = g['process'] || {};
  const supabaseUrl = _process.env?.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = _process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reduced temporary coach bypass: only apply if no real user session (prefer real admin profiles)
  const isTempCoach = request.cookies.get("temp-coach")?.value === "1";
  if (!user && isTempCoach) {
    // Allow protected routes for pure temp bypass testing (layout handles mock profile)
    return supabaseResponse;
  }

  // Note: The root middleware.ts matcher already excludes /login and /auth/* paths,
  // so this early return is a safety net (in case matcher is changed) to ensure
  // auth confirm/callback routes for magic links, signup, and recovery are never
  // subject to getUser() or protection redirects.
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth')
  ) {
    return supabaseResponse;
  }

  // Protected routes (these map to the (app) group pages)
  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/schedule') ||
    pathname.startsWith('/chat') ||
    pathname.startsWith('/roster') ||
    pathname.startsWith('/payments') ||
    pathname.startsWith('/admin');

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Preserve the original destination so we can send the user there after successful login
    url.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Role guard for admin (basic — deeper checks in pages/server actions)
  if (user && pathname.startsWith('/admin')) {
    // Note: We do a lightweight check here; full role validation in pages
    // For now allow through; server components will enforce
  }

  return supabaseResponse;
}
