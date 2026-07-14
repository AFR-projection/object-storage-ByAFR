"use client";

import { cn } from "@/lib/utils";

type LoadingMarkProps = {
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
};

/** Lightweight branded loader — orbit dots, no heavy Lottie. */
export function LoadingMark({
  label = "Loading…",
  className,
  size = "md",
}: LoadingMarkProps) {
  const dim =
    size === "sm" ? "h-7 w-7" : size === "lg" ? "h-12 w-12" : "h-9 w-9";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-muted-foreground",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className={cn("relative", dim)}>
        <span className="loading-orbit absolute inset-0 rounded-full border border-accent/20" />
        <span className="loading-orbit-spin absolute inset-0">
          <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
        </span>
        <span className="absolute inset-[28%] rounded-full bg-accent/15" />
        <span className="loading-core absolute inset-[38%] rounded-full bg-accent/70" />
      </div>
      {label && (
        <p className="text-sm font-medium tracking-wide text-muted-foreground/90">
          <span className="loading-text-shimmer">{label}</span>
        </p>
      )}
    </div>
  );
}
