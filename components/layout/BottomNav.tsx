"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, Calendar, MessageCircle, Users, CreditCard, Shield 
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, roles: ["admin", "coach", "parent", "player"] },
  { href: "/schedule", label: "Schedule", icon: Calendar, roles: ["admin", "coach", "parent", "player"] },
  { href: "/chat", label: "Chat", icon: MessageCircle, roles: ["admin", "coach", "parent", "player"] },
  { href: "/payments", label: "Pay", icon: CreditCard, roles: ["admin", "coach", "parent", "player"] },
  { href: "/roster", label: "Roster", icon: Users, roles: ["admin", "coach", "parent", "player"] },
  { href: "/admin", label: "Admin", icon: Shield, roles: ["admin", "coach"] },
];

interface BottomNavProps {
  role: string;
}

export function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname();
  const visibleItems = navItems.filter(item => item.roles.includes(role));

  return (
    <nav className="bottom-nav border-t bg-card/95">
      <div className="flex justify-around h-16 items-center px-1 text-xs">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-lg transition-colors min-w-[56px]",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="font-medium tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
