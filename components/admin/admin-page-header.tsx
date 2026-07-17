"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Shared header for every admin page: a consistent title + subtitle block on the
 * left and an optional actions slot on the right. Pass `live` to show the pulsing
 * "Live" indicator used by real-time pages. This replaces the ad-hoc <h1> blocks
 * that previously drifted in size and layout across pages.
 */
export function AdminPageHeader({
  title,
  subtitle,
  live,
  liveLabel = "Live • auto-refreshes",
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  live?: boolean;
  liveLabel?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground/70">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {live && (
          <span className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground/60 sm:text-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            {liveLabel}
          </span>
        )}
        {actions}
      </div>
    </motion.div>
  );
}
