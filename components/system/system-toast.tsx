"use client";

import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Info,
  AlertTriangle,
  XCircle,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  dismissNotice,
  EMPTY_NOTICES,
  getSystemNotices,
  subscribeSystemNotices,
  type NotifyTone,
  type SystemNotice,
} from "@/lib/system/notify-store";

const toneStyles: Record<
  NotifyTone,
  { icon: typeof Info; ring: string; accent: string; bar: string }
> = {
  info: {
    icon: Info,
    ring: "border-sky-500/25",
    accent: "text-sky-500",
    bar: "from-sky-500 to-cyan-400",
  },
  success: {
    icon: CheckCircle2,
    ring: "border-emerald-500/25",
    accent: "text-emerald-500",
    bar: "from-emerald-500 to-teal-400",
  },
  warning: {
    icon: AlertTriangle,
    ring: "border-amber-500/30",
    accent: "text-amber-500",
    bar: "from-amber-500 to-orange-400",
  },
  error: {
    icon: XCircle,
    ring: "border-red-500/30",
    accent: "text-red-500",
    bar: "from-red-500 to-rose-400",
  },
  system: {
    icon: Sparkles,
    ring: "border-accent/25",
    accent: "text-accent",
    bar: "from-accent to-violet-400",
  },
};

function ToastCard({ notice }: { notice: SystemNotice }) {
  const style = toneStyles[notice.tone];
  const Icon = style.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, x: 40, scale: 0.96, filter: "blur(4px)" }}
      transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.6 }}
      className={cn(
        "pointer-events-auto relative w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl",
        "border bg-surface/90 shadow-lg backdrop-blur-xl",
        style.ring
      )}
      role="status"
    >
      <div className={cn("absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r opacity-90", style.bar)} />
      <div className="flex gap-3 p-3.5 pr-10">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted/50",
            style.accent
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-semibold leading-snug text-foreground">{notice.title}</p>
          {notice.description && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {notice.description}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => dismissNotice(notice.id)}
        className="absolute right-2 top-2 rounded-lg p-1.5 text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {notice.duration > 0 && (
        <motion.div
          className={cn("absolute bottom-0 left-0 h-[2px] bg-gradient-to-r opacity-50", style.bar)}
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: notice.duration / 1000, ease: "linear" }}
        />
      )}
    </motion.div>
  );
}

export function SystemToastViewport() {
  const notices = useSyncExternalStore(
    subscribeSystemNotices,
    getSystemNotices,
    () => EMPTY_NOTICES as SystemNotice[]
  );

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[120] flex flex-col-reverse gap-2 sm:bottom-6 sm:right-6"
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout">
        {notices.map((notice) => (
          <ToastCard key={notice.id} notice={notice} />
        ))}
      </AnimatePresence>
    </div>
  );
}
