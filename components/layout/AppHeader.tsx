"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, User, Bell } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { getUnreadNotificationCount } from "@/lib/actions";

interface AppHeaderProps {
  userName: string;
  role: string;
  mobile?: boolean;
  isTempUser?: boolean;
}

export function AppHeader({ userName, role, mobile = false, isTempUser = false }: AppHeaderProps) {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Fetch unread count on mount (temp + real)
    getUnreadNotificationCount().then(setUnreadCount).catch(() => setUnreadCount(0));
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Clear temp coach bypass cookie if present
    document.cookie = "temp-coach=; path=/; max-age=0";
    router.push("/login");
  };

  return (
    <header className="mavericks-header sticky top-0 z-40">
      <div className="max-w-7xl mx-auto flex h-14 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-3">
            <TeamLogo size="md" className="drop-shadow-md" />
            <div>
              <div className="font-bold text-lg tracking-tight">Mavericks 12U</div>
              <div className="text-[10px] text-muted-foreground -mt-1">Travel Baseball</div>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <div className="hidden sm:flex items-center gap-2 text-muted-foreground">
            <User className="h-4 w-4" />
            <span className="font-medium text-foreground">{userName}</span>
            {(role === "coach" || role === "admin") && (
              <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                {role.toUpperCase()}
              </span>
            )}
          </div>

          {/* Notification Bell (in-app) */}
          <Link href="/notifications" className="relative flex items-center p-1 text-muted-foreground hover:text-foreground transition" title="Notifications">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-primary text-[9px] text-white rounded-full px-1 min-w-[14px] text-center leading-[10px] font-mono">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>

          <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
