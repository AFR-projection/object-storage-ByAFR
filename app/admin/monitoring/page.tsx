"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import {
  Users, FileText, Upload, Download, Activity, RefreshCw,
  Loader2, Shield,
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

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["admin-monitoring"],
    queryFn: async () => {
      const res = await apiFetch<MonitoringData>("/api/admin/monitoring");
      return res.data;
    },
    refetchInterval: autoRefresh ? 10000 : false, // Auto-refresh every 10 seconds
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Real-time Monitoring"
        subtitle="Live platform metrics • updates every 10 seconds"
        live={autoRefresh}
        liveLabel="Live monitoring active"
        actions={
          <>
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
            <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
              Refresh
            </Button>
          </>
        }
      />

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard
          label="Total Users"
          value={data?.totalUsers ?? 0}
          icon={Users}
          gradient="from-violet-500 to-fuchsia-500"
          iconBg="bg-violet-500/10 text-violet-500"
          delay={0}
        />
        <AdminStatCard
          label="Total Files"
          value={data?.totalFiles ?? 0}
          icon={FileText}
          gradient="from-blue-500 to-cyan-500"
          iconBg="bg-blue-500/10 text-blue-500"
          delay={0.06}
        />
        <AdminStatCard
          label="Uploads (7d)"
          value={data?.uploadActivity ?? 0}
          icon={Upload}
          gradient="from-emerald-500 to-teal-500"
          iconBg="bg-emerald-500/10 text-emerald-500"
          delay={0.12}
        />
        <AdminStatCard
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
