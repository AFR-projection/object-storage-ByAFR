"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

/**
 * The single source of truth for the admin stat tile. Previously this exact
 * component was duplicated in the Overview and Monitoring pages; both now import
 * this. `subtitle` is optional so it works for both the detailed Overview cards
 * and the compact Monitoring cards.
 */
export function AdminStatCard({
  label,
  value,
  icon: Icon,
  gradient,
  iconBg,
  subtitle,
  delay = 0,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** Tailwind gradient classes for the top accent bar, e.g. "from-violet-500 to-fuchsia-500". */
  gradient: string;
  /** Tailwind bg+text classes for the icon chip, e.g. "bg-violet-500/10 text-violet-500". */
  iconBg: string;
  subtitle?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 300, damping: 24 }}
    >
      <Card className="relative overflow-hidden border-border/50 transition-colors hover:border-accent/20">
        <div className={`absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r ${gradient}`} />
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground/60">{subtitle}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}
