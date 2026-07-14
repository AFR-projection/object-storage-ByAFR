"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import {
  getSystemBusy,
  setNavigationBusy,
  subscribeSystemBusy,
} from "@/lib/system/notify-store";

/** Thin top progress bar for route changes + in-flight API activity. */
export function PageProgressBar() {
  const pathname = usePathname();
  const prevPath = useRef(pathname);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const busy = useSyncExternalStore(subscribeSystemBusy, getSystemBusy, () => false);

  useEffect(() => {
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;
    setNavigationBusy(true);
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = setTimeout(() => setNavigationBusy(false), 420);
    return () => {
      if (finishTimer.current) clearTimeout(finishTimer.current);
    };
  }, [pathname]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[130] h-[2px] overflow-hidden"
      aria-hidden
    >
      <div
        className={cn(
          "h-full origin-left bg-gradient-to-r from-accent via-sky-400 to-emerald-400",
          "transition-[transform,opacity] duration-300 ease-out",
          busy ? "page-progress-active opacity-100" : "scale-x-0 opacity-0"
        )}
      />
    </div>
  );
}
