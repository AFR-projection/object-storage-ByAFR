"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  FileText,
  FolderOpen,
  HardDrive,
  Activity,
  Upload,
  Download,
  Trash2,
  BarChart3,
  Cloud,
  Clock,
  Zap,
  File,
  Image,
  Film,
  Music,
  Archive,
  FileArchive,
  Eye,
  TrendingUp,
  Database,
  Gauge,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";
import { cn, formatBytes, formatDate } from "@/lib/utils";
import { useEffect, useState, useMemo } from "react";

const actionIcons: Record<string, typeof Upload> = {
  upload: Upload,
  download: Download,
  delete: Trash2,
  login: Activity,
  create: FileText,
  restore: Upload,
};

const fileTypeIcons: Record<string, typeof File> = {
  "application/pdf": FileText,
  "image/": Image as typeof File,
  "video/": Film as typeof File,
  "audio/": Music as typeof File,
  "application/zip": FileArchive,
  "application/x-rar": FileArchive,
  "application/x-7z": FileArchive,
  "text/": FileText,
  "application/json": FileText,
  "application/msword": FileText,
  "application/vnd.openxmlformats-officedocument": FileText,
  "application/vnd.ms-excel": FileText,
};

function getFileIcon(mimeType: string) {
  for (const [key, icon] of Object.entries(fileTypeIcons)) {
    if (mimeType.startsWith(key)) return icon;
  }
  return File;
}

interface DashboardStats {
  totalFiles: number;
  totalFolders: number;
  storageUsed: number;
  storageQuota: number;
  storageRemaining: number;
  storageWarningThreshold?: number;
}

interface ActivityItem {
  id: string;
  action: string;
  createdAt: string;
  metadata: unknown;
}

interface FileItem {
  id: string;
  name: string;
  mimeType?: string;
  sizeBytes: number;
  updatedAt: string;
  isNote?: boolean;
}

interface DashboardData {
  stats: DashboardStats;
  recentFiles: FileItem[];
  recentActivity: ActivityItem[];
}

// ─── Animated Counter ─────────────────────────────────────────────────────────

function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const duration = 800;
    const steps = 20;
    const increment = value / steps;
    let current = 0;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), value);
      setDisplay(current);
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);

  return <>{display.toLocaleString()}{suffix}</>;
}

// ─── Live Dot ─────────────────────────────────────────────────────────────────

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-40" />
      <span className="relative rounded-full bg-emerald-500 size-2" />
    </span>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  gradient,
  iconBg,
  index,
  isLive,
}: {
  label: string;
  value: string | number;
  icon: typeof Upload;
  gradient: string;
  iconBg: string;
  index: number;
  isLive?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, type: "spring", stiffness: 300, damping: 24 }}
      className="group"
    >
      <Card className="relative overflow-hidden border-border/40 bg-surface/80 backdrop-blur-sm hover:border-accent/25 hover:shadow-lg hover:shadow-accent/5 transition-all duration-300">
        {/* Gradient header bar */}
        <div className={cn("absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r opacity-80", gradient)} />

        {/* Glow on hover */}
        <div className={cn("absolute -inset-24 opacity-0 group-hover:opacity-[0.03] blur-3xl bg-gradient-to-r transition-opacity duration-500 pointer-events-none", gradient)} />

        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-2">
            {label}
            {isLive && <LiveDot />}
          </CardTitle>
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110 duration-300", iconBg)}>
            <Icon className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xl sm:text-2xl font-bold tracking-tight">
            {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Storage Bar ──────────────────────────────────────────────────────────────

function StorageBar({
  used,
  quota,
  remaining,
  warningThreshold = 85,
}: {
  used: number;
  quota: number;
  remaining: number;
  warningThreshold?: number;
}) {
  const usedPct = quota > 0 ? (used / quota) * 100 : 0;
  const remainingPct = quota > 0 ? (remaining / quota) * 100 : 0;
  const warnAt = Math.min(100, Math.max(50, warningThreshold));
  const danger = usedPct > warnAt;
  const warning = usedPct > warnAt - 20 && !danger;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      className="lg:col-span-2"
    >
      <Card className="h-full border-border/50 bg-surface/80 backdrop-blur-sm hover:border-accent/20 transition-all duration-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
              <Database className="h-4 w-4 text-accent" />
            </div>
            Storage Overview
            <div className="ml-auto flex items-center gap-2">
              <LiveDot />
              <span className="text-[10px] font-normal text-muted-foreground/60">Live</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Main progress bar */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">{formatBytes(used)}</span>
              <span className="text-xs text-muted-foreground">of {formatBytes(quota)}</span>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-muted/40">
              <motion.div
                className={cn(
                  "h-full rounded-full transition-colors duration-500",
                  danger ? "bg-gradient-to-r from-red-500 to-red-400 shadow-lg shadow-red-500/20" :
                  warning ? "bg-gradient-to-r from-amber-500 to-yellow-400 shadow-lg shadow-amber-500/20" :
                  "bg-gradient-to-r from-accent via-accent to-accent/80 shadow-lg shadow-accent/20"
                )}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(usedPct, 100)}%` }}
                transition={{ duration: 1.2, ease: "easeOut" }}
              />
              {/* Pulse effect */}
              {usedPct > 0 && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/15 to-transparent"
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                />
              )}
            </div>
          </div>

          {/* Detail breakdown */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Used", value: formatBytes(used), color: "bg-accent", pct: usedPct },
              { label: "Free", value: formatBytes(remaining), color: "bg-muted-foreground/20", pct: remainingPct },
              { label: "Total", value: formatBytes(quota), color: "bg-muted-foreground/10", pct: 100 },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-accent/5 p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={cn("h-2 w-2 rounded-full shrink-0", item.color)} />
                  <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">{item.label}</span>
                </div>
                <p className="text-xs font-bold font-mono">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Danger banner */}
          {danger && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5"
            >
              <Gauge className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-xs font-medium text-red-500">Storage nearly full — consider upgrading your plan</p>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Activity Section ─────────────────────────────────────────────────────────

function ActivitySection({ items }: { items: ActivityItem[] }) {
  const grouped = useMemo(() => {
    const groups: { label: string; items: ActivityItem[] }[] = [];
    const today = new Date();
    const todayStr = today.toDateString();
    const yesterdayStr = new Date(today.getTime() - 86400000).toDateString();

    const todayItems = items.filter((i) => new Date(i.createdAt).toDateString() === todayStr);
    const yesterdayItems = items.filter((i) => new Date(i.createdAt).toDateString() === yesterdayStr);
    const olderItems = items.filter((i) => {
      const d = new Date(i.createdAt).toDateString();
      return d !== todayStr && d !== yesterdayStr;
    });

    if (todayItems.length) groups.push({ label: "Today", items: todayItems });
    if (yesterdayItems.length) groups.push({ label: "Yesterday", items: yesterdayItems });
    if (olderItems.length) groups.push({ label: "Older", items: olderItems });

    return groups;
  }, [items]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      className="lg:col-span-3"
    >
      <Card className="h-full border-border/50 bg-surface/80 backdrop-blur-sm hover:border-accent/20 transition-all duration-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
              <TrendingUp className="h-4 w-4 text-accent" />
            </div>
            Recent Activity
            <div className="ml-auto flex items-center gap-1.5 text-[10px] font-normal text-muted-foreground/60">
              <div className="flex items-center gap-1">
                <div className="size-1.5 rounded-full bg-emerald-500" />
                <span>Real-time</span>
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {grouped.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Activity className="h-8 w-8 opacity-30" />
              <p className="text-sm">No recent activity</p>
            </div>
          ) : (
            <div className="px-4">
              {grouped.map((group) => (
                <div key={group.label} className="py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1">{group.label}</p>
                  <div className="space-y-0.5">
                    {group.items.slice(0, 8).map((log, idx) => {
                      const Icon = actionIcons[log.action] ?? Activity;
                      return (
                        <motion.div
                          key={log.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.02 }}
                          className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-accent/5 transition-colors"
                        >
                          <div className="relative shrink-0">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 group-hover:bg-accent/20 transition-colors">
                              <Icon className="h-4 w-4 text-accent" />
                            </div>
                            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface bg-emerald-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium capitalize truncate">{log.action}</span>
                            </div>
                            {(() => {
                              const meta = log.metadata as Record<string, unknown> | null;
                              return meta && typeof meta === "object" && typeof meta.name === "string" ? (
                                <p className="truncate text-xs text-muted-foreground/50">{meta.name}</p>
                              ) : null;
                            })()}
                          </div>
                          <span className="shrink-0 text-[11px] text-muted-foreground/40 font-mono">{formatDate(log.createdAt, "short")}</span>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Recent Files ────────────────────────────────────────────────────────────────

function RecentFilesSection({ files }: { files: FileItem[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card className="border-border/50 bg-surface/80 backdrop-blur-sm hover:border-accent/20 transition-all duration-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
              <FileText className="h-4 w-4 text-accent" />
            </div>
            Recent Files
            <span className="ml-auto text-[10px] font-normal text-muted-foreground/60">{files.length} file{files.length !== 1 ? "s" : ""}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {files.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Cloud className="h-8 w-8 opacity-30" />
              <p className="text-sm">No files yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {files.slice(0, 5).map((file, idx) => {
                const Icon = file.isNote ? FileText : (file.mimeType ? getFileIcon(file.mimeType) : FileText);
                return (
                  <motion.div
                    key={file.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="group flex items-center justify-between px-5 py-3.5 hover:bg-accent/5 transition-colors -mx-0"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                        file.isNote ? "bg-accent/15" : "bg-accent/5 group-hover:bg-accent/10"
                      )}>
                        <Icon className={cn("h-4 w-4", file.isNote ? "text-accent" : "text-muted-foreground/70")} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-[11px] text-muted-foreground/50">
                          {formatBytes(file.sizeBytes)} · {formatDate(file.updatedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      {file.isNote && (
                        <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">Note</span>
                      )}
                      <span className="hidden sm:inline font-mono text-xs text-muted-foreground/60">{formatBytes(file.sizeBytes)}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

const FileTextFile = FileText;

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-56 skeleton rounded-lg" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 skeleton rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2 h-64 skeleton rounded-2xl" />
        <div className="lg:col-span-3 h-64 skeleton rounded-2xl" />
      </div>
      <div className="h-48 skeleton rounded-2xl" />
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30">
        <BarChart3 className="h-8 w-8 opacity-40" />
      </div>
      <p className="text-lg font-semibold text-foreground/60">Welcome to your dashboard</p>
      <p className="text-sm max-w-md text-center text-muted-foreground/60">
        Start uploading files and your storage analytics will appear here.
      </p>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await apiFetch<DashboardData>("/api/dashboard");
      return res.data ?? (res as unknown as DashboardData);
    },
    refetchInterval: 30_000,
  });

  if (isLoading) return <DashboardSkeleton />;

  const stats = data?.stats;
  const recentFiles = data?.recentFiles ?? [];
  const recentActivity = data?.recentActivity ?? [];

  if (!stats) return <EmptyState />;

  return (
    <div>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10">
            <Gauge className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground/60">Real-time overview of your storage and activity</p>
          </div>
        </div>
      </motion.div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-8">
        <StatCard
          label="Total Files"
          value={stats.totalFiles}
          icon={FileText}
          gradient="from-violet-500 to-fuchsia-500"
          iconBg="bg-violet-500/10 text-violet-500"
          index={0}
          isLive
        />
        <StatCard
          label="Total Folders"
          value={stats.totalFolders}
          icon={FolderOpen}
          gradient="from-blue-500 to-cyan-500"
          iconBg="bg-blue-500/10 text-blue-500"
          index={1}
        />
        <StatCard
          label="Storage Used"
          value={formatBytes(stats.storageUsed)}
          icon={Database}
          gradient="from-emerald-500 to-teal-500"
          iconBg="bg-emerald-500/10 text-emerald-500"
          index={2}
          isLive
        />
        <StatCard
          label="Storage Free"
          value={formatBytes(stats.storageRemaining)}
          icon={BarChart3}
          gradient="from-amber-500 to-orange-500"
          iconBg="bg-amber-500/10 text-amber-500"
          index={3}
        />
      </div>

      {/* Storage + Activity */}
      <div className="grid gap-6 lg:grid-cols-5 mb-6">
        <StorageBar
          used={stats.storageUsed}
          quota={stats.storageQuota}
          remaining={stats.storageRemaining}
          warningThreshold={stats.storageWarningThreshold}
        />
        <ActivitySection items={recentActivity} />
      </div>

      {/* Recent Files */}
      <RecentFilesSection files={recentFiles} />
    </div>
  );
}