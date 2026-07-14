"use client";

import { useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, RefreshCw, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getConnectionStatus,
  subscribeConnectionStatus,
  type ConnectionStatus,
} from "@/lib/system/notify-store";

const labels: Record<
  ConnectionStatus,
  { text: string; icon: typeof Wifi; tone: string; show: boolean }
> = {
  idle: { text: "", icon: Radio, tone: "", show: false },
  connecting: {
    text: "Connecting…",
    icon: Radio,
    tone: "text-sky-500 border-sky-500/25 bg-sky-500/10",
    show: true,
  },
  live: {
    text: "Live",
    icon: Wifi,
    tone: "text-emerald-500 border-emerald-500/25 bg-emerald-500/10",
    show: true,
  },
  reconnecting: {
    text: "Reconnecting…",
    icon: RefreshCw,
    tone: "text-amber-500 border-amber-500/30 bg-amber-500/10",
    show: true,
  },
  offline: {
    text: "Offline",
    icon: WifiOff,
    tone: "text-red-500 border-red-500/30 bg-red-500/10",
    show: true,
  },
};

/** Compact live status pill — Connecting / Live / Reconnecting / Offline. */
export function ConnectionStatusPill({ className }: { className?: string }) {
  const status = useSyncExternalStore(
    subscribeConnectionStatus,
    getConnectionStatus,
    () => "idle" as ConnectionStatus
  );
  const config = labels[status];
  const Icon = config.icon;

  return (
    <AnimatePresence>
      {config.show && (
        <motion.div
          key={status}
          initial={{ opacity: 0, y: -8, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.94 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
          className={cn(
            "pointer-events-none fixed left-1/2 top-3 z-[115] -translate-x-1/2",
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
            "text-[11px] font-medium shadow-md backdrop-blur-md",
            config.tone,
            className
          )}
        >
          <Icon
            className={cn(
              "h-3 w-3",
              (status === "connecting" || status === "reconnecting") && "animate-spin-slow"
            )}
          />
          <span>{config.text}</span>
          {(status === "connecting" || status === "reconnecting") && (
            <span className="status-dot-pulse ml-0.5" aria-hidden />
          )}
          {status === "live" && <span className="status-dot-live ml-0.5" aria-hidden />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
