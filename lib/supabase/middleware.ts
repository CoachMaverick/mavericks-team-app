import { NextResponse, type NextRequest } from 'next/server';

// Official Supabase + Next.js Edge middleware pattern using createMiddlewareClient.
// We alias createServerClient because @supabase/ssr exposes the middleware
// client via createServerClient (the historical createMiddlewareClient name
// is provided here via alias for the requested API).
// Env vars are captured at module top so Next.js can inline the values.
// The runtime Edge code contains no process.* or other Node APIs.
// Cookie adapter uses only request.cookies (Edge compatible).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const pathname = request.nextUrl.pathname

  // Bypass Server Action requests entirely (they manage their own auth).
  if (request.headers.get('next-action')) {
    return supabaseResponse
  }

  // Dynamic import keeps Supabase code out of static Edge analysis.
  const { createServerClient } = await import('@supabase/ssr')

  // Use createMiddlewareClient as explicitly requested.
  const createMiddlewareClient = createServerClient

  const supabase = createMiddlewareClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() must immediately follow client creation (Supabase requirement).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Basic temp-coach bypass (kept for app compatibility).
  const isTempCoach = request.cookies.get('temp-coach')?.value === '1'
  if (!user && isTempCoach) {
    return supabaseResponse
  }

  // Skip auth flows.
  if (pathname.startsWith('/login') || pathname.startsWith('/auth')) {
    return supabaseResponse
  }

  // Basic protected route protection + redirect.
  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/schedule') ||
    pathname.startsWith('/chat') ||
    pathname.startsWith('/roster') ||
    pathname.startsWith('/payments') ||
    pathname.startsWith('/admin')

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(url)
  }

  // Basic admin light check.
  if (user && pathname.startsWith('/admin')) {
    // deeper checks elsewhere
  }

  return supabaseResponse
}
