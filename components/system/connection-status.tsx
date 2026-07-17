"use client";

import { useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getConnectionStatus,
  subscribeConnectionStatus,
  type ConnectionStatus,
} from "@/lib/system/notify-store";

type Variant = {
  text: string;
  tone: string;
  glow: string;
  show: boolean;
  /** which trailing indicator to render */
  indicator: "bars" | "live" | "pulse" | "none";
};

const VARIANTS: Record<ConnectionStatus, Variant> = {
  idle: { text: "", tone: "", glow: "", show: false, indicator: "none" },
  connecting: {
    text: "Connecting",
    tone: "text-sky-400 border-sky-400/25 bg-sky-500/10",
    glow: "shadow-[0_4px_20px_-4px_rgba(56,189,248,0.5)]",
    show: true,
    indicator: "bars",
  },
  live: {
    text: "Live",
    tone: "text-emerald-400 border-emerald-400/25 bg-emerald-500/10",
    glow: "shadow-[0_4px_20px_-4px_rgba(52,211,153,0.5)]",
    show: true,
    indicator: "live",
  },
  reconnecting: {
    text: "Reconnecting",
    tone: "text-amber-400 border-amber-400/30 bg-amber-500/10",
    glow: "shadow-[0_4px_20px_-4px_rgba(251,191,36,0.5)]",
    show: true,
    indicator: "bars",
  },
  offline: {
    text: "Offline",
    tone: "text-red-400 border-red-400/30 bg-red-500/10",
    glow: "shadow-[0_4px_20px_-4px_rgba(248,113,113,0.45)]",
    show: true,
    indicator: "pulse",
  },
};

function LeadIcon({ status }: { status: ConnectionStatus }) {
  if (status === "offline") return <WifiOff className="h-3 w-3" />;
  if (status === "live") return <Wifi className="h-3 w-3" />;
  // connecting / reconnecting: gently spinning radio ping
  return <Radio className="h-3 w-3 animate-spin-slow" />;
}

/**
 * Compact live-status pill (top-center): Connecting / Live / Reconnecting /
 * Offline. Sleek glassy chip with a colored glow, a sweeping sheen, and a
 * status-specific indicator — animated signal bars while (re)connecting, a
 * rippling dot when live. All motion is CSS transform/opacity (cheap) and
 * respects reduced-motion.
 */
export function ConnectionStatusPill({ className }: { className?: string }) {
  const status = useSyncExternalStore(
    subscribeConnectionStatus,
    getConnectionStatus,
    () => "idle" as ConnectionStatus
  );
  const v = VARIANTS[status];

  return (
    <AnimatePresence mode="wait">
      {v.show && (
        <motion.div
          key={status}
          initial={{ opacity: 0, y: -10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 440, damping: 30 }}
          className={cn(
            "pointer-events-none fixed left-1/2 top-3 z-[115] -translate-x-1/2",
            "relative overflow-hidden",
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
            "text-[11px] font-semibold tracking-wide backdrop-blur-xl",
            v.tone,
            v.glow,
            className
          )}
        >
          {/* Sheen sweep — only while actively (re)connecting for a "working" feel */}
          {v.indicator === "bars" && <span className="status-pill-sheen" aria-hidden />}

          <LeadIcon status={status} />
          <span className="relative">{v.text}</span>

          {v.indicator === "bars" && (
            <span className="signal-bars ml-0.5" aria-hidden>
              <i />
              <i />
              <i />
              <i />
            </span>
          )}
          {v.indicator === "live" && <span className="status-dot-live ml-0.5" aria-hidden />}
          {v.indicator === "pulse" && <span className="status-dot-pulse ml-0.5" aria-hidden />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
