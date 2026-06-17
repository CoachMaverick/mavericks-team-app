import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get("next") ?? "/dashboard";

  // Prefer the configured site URL from env for consistent redirects (important for magic link flows and "site URL is properly set").
  // Falls back to the request origin. Always normalize to avoid trailing slashes causing path issues.
  const configuredSite = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, '');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host"); // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === "development";
      let redirectUrl: string;
      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        redirectUrl = `${configuredSite}${next}`;
      } else if (forwardedHost) {
        redirectUrl = `https://${forwardedHost}${next}`;
      } else {
        redirectUrl = `${configuredSite}${next}`;
      }
      return NextResponse.redirect(redirectUrl);
    } else {
      // Surface the real error (e.g. invalid redirect path, bad code, etc.) to the login page
      const message = error.message || 'auth';
      return NextResponse.redirect(`${configuredSite}/login?error=${encodeURIComponent(message)}`);
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${configuredSite}/login?error=auth`);
}
