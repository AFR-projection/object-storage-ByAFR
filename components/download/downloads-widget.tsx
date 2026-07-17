"use client";

import { useSyncExternalStore, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, X, CheckCircle2, XCircle, Loader2, Trash2 } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import {
  EMPTY_DOWNLOADS,
  getDownloads,
  subscribeDownloads,
  clearDownloadHistory,
  type DownloadItem,
} from "@/lib/download/download-store";

function useDownloads(): readonly DownloadItem[] {
  return useSyncExternalStore(subscribeDownloads, getDownloads, () => EMPTY_DOWNLOADS);
}

function speedLabel(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return "";
  return `${formatBytes(bytesPerSec)}/s`;
}

function DownloadRow({ item }: { item: DownloadItem }) {
  const pct =
    item.total > 0 ? Math.min(100, Math.round((item.loaded / item.total) * 100)) : null;

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0">
          {item.status === "active" && <Loader2 className="h-4 w-4 animate-spin text-sky-500" />}
          {item.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          {item.status === "error" && <XCircle className="h-4 w-4 text-red-500" />}
          {item.status === "canceled" && <X className="h-4 w-4 text-muted-foreground" />}
        </span>
        <span className="flex-1 truncate text-xs font-medium" title={item.name}>
          {item.name}
        </span>
        {item.status === "active" && item.speed > 0 && (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {speedLabel(item.speed)}
          </span>
        )}
      </div>

      {item.status === "active" && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
          {pct !== null ? (
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all"
              style={{ width: `${pct}%` }}
            />
          ) : (
            // Indeterminate (streamed ZIP, total unknown): show a moving bar.
            <div className="h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-sky-500 to-cyan-400" />
          )}
        </div>
      )}

      {item.status === "active" && item.loaded > 0 && (
        <div className="mt-1 text-[10px] tabular-nums text-muted-foreground">
          {formatBytes(item.loaded)}
          {item.total > 0 ? ` / ${formatBytes(item.total)}` : ""}
          {pct !== null ? ` · ${pct}%` : ""}
        </div>
      )}

      {item.status === "error" && item.error && (
        <div className="mt-1 text-[10px] text-red-500">{item.error}</div>
      )}
    </div>
  );
}

/** Floating downloads widget: a badge button that expands into a history panel. */
export function DownloadsWidget() {
  const downloads = useDownloads();
  const [open, setOpen] = useState(false);

  const activeCount = downloads.reduce((n, d) => (d.status === "active" ? n + 1 : n), 0);

  // Nothing to show and never used → render nothing.
  if (downloads.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-background/95 shadow-2xl backdrop-blur"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold">
                Downloads{activeCount > 0 ? ` · ${activeCount} active` : ""}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearDownloadHistory}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Clear finished"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="max-h-80 divide-y divide-border overflow-y-auto">
              {downloads.map((d) => (
                <DownloadRow key={d.id} item={d} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/95 shadow-lg backdrop-blur transition-colors hover:bg-muted",
          activeCount > 0 && "border-sky-500/40"
        )}
        title="Downloads"
      >
        <Download className={cn("h-5 w-5", activeCount > 0 && "text-sky-500")} />
        {activeCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>
    </div>
  );
}
