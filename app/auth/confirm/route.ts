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

      return NextResponse.redirect(redirectUrl);
    }

    // Error (e.g. invalid/expired token)
    return NextResponse.redirect(
      `${configuredSite}/login?error=${encodeURIComponent(error.message || "auth")}`
    );
  }

  // Fallback / missing params
  return NextResponse.redirect(`${configuredSite}/login?error=auth`);
}
