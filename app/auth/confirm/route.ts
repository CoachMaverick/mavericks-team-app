import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Handles Supabase magic link and signup confirmation using the token_hash flow.
// This matches the default/recommended Supabase email template variables:
// {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}
//
// You must:
// 1. Set Site URL in Supabase Dashboard to http://localhost:3000 (for dev)
// 2. Add http://localhost:3000/auth/confirm and http://localhost:3000/** to Redirect URLs
// 3. Update Magic Link and Confirm signup email templates to use the above URL format (instead of default ConfirmationURL if needed).

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as 
    | "signup" 
    | "magiclink" 
    | "recovery" 
    | "invite" 
    | "email_change" 
    | null;

  const next = searchParams.get("next") ?? "/dashboard";

  // Prefer NEXT_PUBLIC_APP_URL so it matches what you set as Site URL in Supabase.
  // This ensures "default Supabase email templates work with http://localhost:3000".
  const configuredSite = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, "");

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });

    if (!error) {
      // Session cookies are set by the Supabase server client.
      // Ensure new user has a basic profile (in case trigger didn't run or for magic link)
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
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as any);
          }
        }
      } catch (profileErr) {
        console.warn("Profile creation check skipped (non-fatal):", profileErr);
      }

      // Redirect the user to the next page (or dashboard).
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      let redirectUrl: string;
      if (isLocalEnv) {
        redirectUrl = `${configuredSite}${next}`;
      } else if (forwardedHost) {
        redirectUrl = `https://${forwardedHost}${next}`;
      } else {
        redirectUrl = `${configuredSite}${next}`;
      }

      if (type === 'recovery') {
        // For password reset, redirect to login with recovery flag so we can show new password form (session is set for recovery)
        return NextResponse.redirect(`${configuredSite}/login?type=recovery`);
      }
      return NextResponse.redirect(redirectUrl);
    }

    // Error (e.g. invalid/expired token) - better messages
    let errorMessage = error.message || "auth";
    if (errorMessage.toLowerCase().includes("rate") || errorMessage.toLowerCase().includes("too many")) {
      errorMessage = "Too many attempts — please wait a few minutes before trying again.";
    } else if (errorMessage.includes("expired") || errorMessage.includes("invalid")) {
      errorMessage = "Magic link expired or invalid. Please try signing up or logging in again.";
    }
    return NextResponse.redirect(
      `${configuredSite}/login?error=${encodeURIComponent(errorMessage)}`
    );
  }

  // Fallback / missing params
  return NextResponse.redirect(`${configuredSite}/login?error=auth`);
}
