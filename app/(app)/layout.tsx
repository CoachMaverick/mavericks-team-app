import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import type { Profile } from "@/lib/supabase/types";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const isTempCoachCookie = cookieStore.get("temp-coach")?.value === "1";

  let user: any = null;
  let profile: any = null;

  // Always attempt real Supabase authentication first (prefer real profile data)
  let realUser: any = null;
  let supabase: any = null;
  try {
    supabase = await createClient();
    const { data: { user: u } } = await supabase.auth.getUser();
    realUser = u;
  } catch (e) {
    console.error("PAGE ERROR:", e);
    console.warn('Supabase auth getUser failed in layout (missing config/tables?):', (e as any)?.message);
    realUser = null;
  }

  if (realUser) {
    user = realUser;

    // Fetch profile, now including is_admin. Prioritize real profile data.
    // Wrapped to survive missing 'profiles' table or columns in prod Supabase.
    try {
      const { data: realProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", realUser.id)
        .single();
      profile = realProfile;
    } catch (e) {
      console.error("PAGE ERROR:", e);
      console.warn("Profile fetch failed in layout (missing table/columns?):", (e as any)?.message);
      profile = null;
    }

    // Force admin rights for the coach email as fallback (even if profile.is_admin is missing/false)
    if (realUser && realUser.email?.toLowerCase() === "coach@comavericksbaseball.com") {
      if (!profile) {
        profile = { role: "admin", is_admin: true };
      } else {
        profile.role = "admin";
        profile.is_admin = true;
      }
    }

    // When real admin (is_admin=true) detected, we do not use temp bypass.
  } else if (isTempCoachCookie) {
    // Pure fallback for testing when no real Supabase session
    user = {
      id: "temp-coach-id",
      email: "coach@comavericksbaseball.com",
    };
    profile = {
      id: "temp-coach-id",
      role: "admin" as const,
      first_name: "Coach",
      last_name: "Maverick",
      phone: null,
      avatar_url: null,
      family_id: null,
      last_active_at: null,
      created_at: new Date().toISOString(),
      updated_at: null,
      is_admin: true,
    };
  } else {
    redirect("/login");
  }

  const isRealAdmin = profile && (profile.is_admin === true || profile.role === 'admin');
  const userRole = isRealAdmin ? 'admin' : (profile?.role || "parent");
  const isTempUser = !realUser && isTempCoachCookie;  // only pure temp bypass for testing, no real session
  const userName =
    profile && (profile.first_name || profile.last_name)
      ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
      : user.email?.split("@")[0] || "Teammate";

  // Friendly first-time message for brand new signups (profile exists but names empty)
  const isFirstTime = profile && !profile.first_name && !profile.last_name;

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar + header */}
      <div className="hidden md:flex">
        <AppSidebar role={userRole} />
        <div className="flex-1">
          <AppHeader userName={userName} role={userRole} isTempUser={isTempUser} />
          <main className="p-6 max-w-7xl mx-auto">
            {isFirstTime && (
              <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
                Welcome! Your profile will be completed soon (or by an admin). You can explore the app.
              </div>
            )}
            {children}
          </main>
        </div>
      </div>

      {/* Mobile: header + content + bottom nav */}
      <div className="md:hidden">
        <AppHeader userName={userName} role={userRole} mobile isTempUser={isTempUser} />
        <main className="p-4 pb-24 max-w-2xl mx-auto">
          {isFirstTime && (
            <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
              Welcome! Your profile setup will be completed soon.
            </div>
          )}
          {children}
        </main>
        <BottomNav role={userRole} />
      </div>
    </div>
  );
}
