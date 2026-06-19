import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as 
    | "signup" 
    | "magiclink" 
    | "recovery" 
    | "invite" 
    | "email_change" 
    | null;
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get("next") ?? "/dashboard";

  // Prefer the configured site URL from env for consistent redirects (important for magic link flows and "site URL is properly set").
  // Falls back to the request origin. Always normalize to avoid trailing slashes causing path issues.
  const configuredSite = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, '');

  const supabase = await createClient();

  let authError: any = null;

  if (code) {
    // PKCE flow (common for magic links and OAuth)
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authError = error;
  } else if (token_hash && type) {
    // Token hash flow for magic links / signup confirm
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });
    authError = error;
  }

  if (!authError) {
    // Successfully exchanged/verified - user should be logged in now (session cookies set)
    // Ensure new user has a basic profile automatically
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.id) {
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        if (!existingProfile) {
          await supabase.from("profiles").insert({
            id: user.id,
            email: user.email,
            role: "parent",
            first_name: "",
            last_name: "",
            is_admin: false,
            has_completed_onboarding: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any);
        }
      }
    } catch (profileErr) {
      console.warn("Profile creation check skipped (non-fatal):", profileErr);
    }

    // For password recovery links, send user to the dedicated reset password page.
    if (type === 'recovery') {
      return NextResponse.redirect(`${configuredSite}/auth/reset-password`);
    }

    // Auto-redirect to dashboard (or next param) - user is now logged in
    // But if no family_id on profile (typical for new parents), redirect to /login so the family prompt triggers.
    // Covers signup/first-login for magic links + Email+PW flows uniformly.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("family_id, role, has_completed_onboarding")
          .eq("id", user.id)
          .maybeSingle() as any;
        const needsSetup = (prof?.has_completed_onboarding === false || (prof?.has_completed_onboarding == null && !prof?.family_id)) &&
          (prof?.role !== 'coach' && prof?.role !== 'admin');
        if (needsSetup) {
          const loginUrl = `${configuredSite}/login?prompt=family`;
          return NextResponse.redirect(loginUrl);
        }
      }
    } catch {}

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
  }

  // Error case - better error message
  let errorMessage = authError?.message || "Authentication failed. The link may be invalid or expired.";
  if (errorMessage.toLowerCase().includes("rate") || errorMessage.toLowerCase().includes("too many")) {
    errorMessage = "Too many attempts — please wait a few minutes before trying again.";
  } else if (errorMessage.includes("expired") || errorMessage.includes("invalid")) {
    errorMessage = "Magic link expired or invalid. Please try signing up or logging in again.";
  }
  return NextResponse.redirect(`${configuredSite}/login?error=${encodeURIComponent(errorMessage)}`);
}
