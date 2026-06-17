"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, Calendar, MessageCircle, Users, CreditCard, Shield 
} from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "coach", "parent", "player"] },
  { href: "/schedule", label: "Schedule", icon: Calendar, roles: ["admin", "coach", "parent", "player"] },
  { href: "/chat", label: "Chat", icon: MessageCircle, roles: ["admin", "coach", "parent", "player"] },
  { href: "/roster", label: "Roster", icon: Users, roles: ["admin", "coach", "parent", "player"] },
  { href: "/payments", label: "Payments", icon: CreditCard, roles: ["admin", "coach", "parent", "player"] },
  { href: "/admin", label: "Admin", icon: Shield, roles: ["admin", "coach"] },
];

interface AppSidebarProps {
  role: string;
}

export function AppSidebar({ role }: AppSidebarProps) {
  const pathname = usePathname();

  const visibleItems = navItems.filter(item => item.roles.includes(role));

  return (
    <aside className="w-64 border-r border-border bg-card/50 h-screen sticky top-0 hidden md:block overflow-auto">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <TeamLogo size="lg" />
          <div>
            <div className="font-bold text-xl tracking-tight">Mavericks 12U</div>
            <div className="text-xs text-muted-foreground -mt-1">Travel Baseball</div>
          </div>
        </div>

        <nav className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href === "/dashboard" && pathname === "/(app)");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-8 text-[10px] text-muted-foreground">
          Team app • v0.1
        </div>
      </div>
    </aside>
  );
}
