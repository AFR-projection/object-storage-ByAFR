"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, CheckCircle2, AlertCircle, Pause, Play, RotateCcw, Trash2, ChevronUp, ChevronDown, Zap, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadQueue, formatSpeed, formatETA, type UploadItem, type UploadStats } from "@/lib/upload-queue";
import { formatBytes, cn } from "@/lib/utils";

interface UploadPanelProps {
  queue: UploadQueue;
  onDismiss: () => void;
}

export function UploadPanel({ queue, onDismiss }: UploadPanelProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [stats, setStats] = useState<UploadStats>({
    total: 0, completed: 0, failed: 0, active: 0, queued: 0,
    totalBytes: 0, loadedBytes: 0, overallProgress: 0, speed: 0, eta: 0,
  });
  const [minimized, setMinimized] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const onChange = (newItems: UploadItem[], newStats: UploadStats) => {
      setItems([...newItems]);
      setStats(newStats);
    };
    queue.on("change", onChange);
    return () => { queue.on("change", () => {}); };
  }, [queue]);

  const allDone = stats.completed + stats.failed === stats.total && stats.total > 0;

  function handleDismiss() {
    queue.clearCompleted();
    if (allDone) onDismiss();
  }

  const visibleItems = minimized ? [] : items.filter((i) => i.status !== "cancelled").slice(-8);

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="fixed bottom-4 right-4 z-50 w-full sm:w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border/50 bg-surface/95 backdrop-blur-xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", stats.active > 0 ? "bg-accent/10" : "bg-muted/50")}>
            {stats.active > 0 ? (
              <Upload className="h-3.5 w-3.5 text-accent animate-pulse" />
            ) : allDone ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Upload className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="text-xs font-semibold">
              {stats.active > 0 ? "Uploading..." : allDone ? "Upload Complete" : "Upload Queue"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {stats.completed}/{stats.total} files
              {stats.speed > 0 && ` · ${formatSpeed(stats.speed)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {!allDone && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 sm:h-7 sm:w-7"
              onClick={() => { paused ? queue.resume() : queue.pause(); setPaused(!paused); }}
              title={paused ? "Resume" : "Pause"}
            >
              {paused ? <Play className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> : <Pause className="h-4 w-4 sm:h-3.5 sm:w-3.5" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-7 sm:w-7" onClick={() => setMinimized(!minimized)}>
            {minimized ? <ChevronUp className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> : <ChevronDown className="h-4 w-4 sm:h-3.5 sm:w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-7 sm:w-7" onClick={handleDismiss} title="Dismiss">
            <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </Button>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="px-4 py-2.5 border-b border-border/30">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-accent" />{formatSpeed(stats.speed)}</span>
            {stats.eta > 0 && stats.active > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatETA(stats.eta)}</span>}
          </div>
          <span className="text-[10px] font-mono font-medium">{Math.round(stats.overallProgress)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
          <motion.div
            className={cn("h-full rounded-full", stats.failed > 0 && stats.completed === 0 ? "bg-red-500" : "bg-accent")}
            animate={{ width: `${stats.overallProgress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground/60">
          <span>{formatBytes(stats.loadedBytes)} / {formatBytes(stats.totalBytes)}</span>
          <span>{stats.completed} done{stats.failed > 0 ? ` · ${stats.failed} failed` : ""}</span>
        </div>
      </div>

      {/* File List */}
      <div className="max-h-[240px] overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {visibleItems.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 py-2 border-b border-border/20 last:border-0"
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{item.file?.name ?? "Unknown"}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{formatBytes(item.file?.size ?? 0)}</span>
                    {item.remotePath.includes("/") && (
                      <span className="text-[10px] text-muted-foreground/50 truncate max-w-[120px]">
                        in {item.remotePath.split("/").slice(0, -1).join("/")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {item.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  {item.status === "error" && (
                    <div className="flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                      <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-5 sm:w-5" onClick={() => queue.retryItem(item.id)} title="Retry">
                        <RotateCcw className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                      </Button>
                    </div>
                  )}
                  {item.status === "uploading" && (
                    <span className="text-[10px] font-mono text-accent">{item.progress}%</span>
                  )}
                  {item.status === "queued" && (
                    <span className="text-[10px] text-muted-foreground/50">Queued</span>
                  )}
                  {(item.status === "queued" || item.status === "error") && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-5 sm:w-5" onClick={() => queue.cancelItem(item.id)}>
                      <X className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                    </Button>
                  )}
                </div>
              </div>
              {item.status === "uploading" && (
                <div className="mt-1 h-1 rounded-full bg-muted/50 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    animate={{ width: `${item.progress}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
              )}
              {item.status === "error" && item.error && (
                <p className="mt-0.5 text-[10px] text-red-500 truncate">{item.error}</p>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Footer Actions */}
      {stats.failed > 0 && !minimized && (
        <div className="px-4 py-2 border-t border-border/30 flex justify-end">
          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => queue.retryFailed()}>
            <RotateCcw className="h-3 w-3 mr-1" /> Retry All Failed
          </Button>
        </div>
      )}
    </motion.div>
  );
}
