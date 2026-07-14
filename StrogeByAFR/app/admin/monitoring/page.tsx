"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";
import {
  Users, FileText, Upload, Download, Activity, RefreshCw,
  Loader2, Shield, FolderOpen, Share2, Clock,
} from "lucide-react";
import { useState } from "react";

interface MonitoringData {
  totalUsers: number;
  totalFiles: number;
  uploadActivity: number;
  downloadActivity: number;
  loginActivity: number;
}

export default function AdminMonitoringPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-monitoring"],
    queryFn: async () => {
      const res = await apiFetch<MonitoringData>("/api/admin/monitoring");
      return res.data;
    },
    refetchInterval: autoRefresh ? 10000 : false, // Auto-refresh every 10 seconds
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Real-time Monitoring</h1>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Live platform metrics • Updates every 10 seconds
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? "default" : "secondary"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="gap-1.5"
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {autoRefresh ? "Live" : "Paused"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* Live indicator */}
      {autoRefresh && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 text-sm text-emerald-600"
        >
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Live monitoring active
        </motion.div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Users"
          value={data?.totalUsers ?? 0}
          icon={Users}
          gradient="from-violet-500 to-fuchsia-500"
          iconBg="bg-violet-500/10 text-violet-500"
          delay={0}
        />
        <StatCard
          label="Total Files"
          value={data?.totalFiles ?? 0}
          icon={FileText}
          gradient="from-blue-500 to-cyan-500"
          iconBg="bg-blue-500/10 text-blue-500"
          delay={0.06}
        />
        <StatCard
          label="Uploads (7d)"
          value={data?.uploadActivity ?? 0}
          icon={Upload}
          gradient="from-emerald-500 to-teal-500"
          iconBg="bg-emerald-500/10 text-emerald-500"
          delay={0.12}
        />
        <StatCard
          label="Downloads (7d)"
          value={data?.downloadActivity ?? 0}
          icon={Download}
          gradient="from-amber-500 to-orange-500"
          iconBg="bg-amber-500/10 text-amber-500"
          delay={0.18}
        />
      </div>

      {/* Activity Summary */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24 }}
      >
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Activity Summary (7 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-violet-500/10">
                  <Shield className="h-7 w-7 text-violet-500" />
                </div>
                <div>
                  <p className="text-3xl font-bold">{data?.loginActivity ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Logins</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/10">
                  <Upload className="h-7 w-7 text-emerald-500" />
                </div>
                <div>
                  <p className="text-3xl font-bold">{data?.uploadActivity ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Uploads</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500/10">
                  <Download className="h-7 w-7 text-blue-500" />
                </div>
                <div>
                  <p className="text-3xl font-bold">{data?.downloadActivity ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Downloads</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  gradient,
  iconBg,
  delay,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  gradient: string;
  iconBg: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Card className="relative overflow-hidden border-border/50 hover:border-accent/20 transition-colors">
        <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${gradient}`} />
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}