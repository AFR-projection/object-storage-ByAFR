"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { LayoutDashboard, Users, BarChart3, ScrollText, Sliders } from "lucide-react";

const tabs = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/monitoring", label: "Monitoring", icon: BarChart3 },
  { href: "/admin/logs", label: "Logs", icon: ScrollText },
  { href: "/admin/settings", label: "Settings", icon: Sliders },
];

export function AdminTabs({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      {/* Tabs */}
      <div className="relative mb-8 flex flex-wrap gap-1 rounded-2xl bg-muted/40 p-1.5 border border-border/40">
        {tabs.map((tab) => {
          const active = tab.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors z-10",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && (
                <motion.div
                  layoutId="admin-tab-bg"
                  className="absolute inset-0 rounded-xl bg-surface shadow-sm border border-border/50"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <tab.icon className="relative z-10 h-4 w-4" />
              <span className="relative z-10">{tab.label}</span>
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}