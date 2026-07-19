"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plug, Radio } from "lucide-react";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api/client";
import {
  ConnectionPanel,
  type ConnectionSectionId,
} from "@/components/connection/connection-panel";

type ConnectStatus = {
  live?: { mcpSessionsActive: number; serverTime: string };
};

function LiveStatusBadge() {
  const { data } = useQuery({
    queryKey: ["connect-status"],
    queryFn: async () => {
      const res = await apiFetch<ConnectStatus>("/api/v1/connect");
      if (!res.success || !res.data) throw new Error(res.error ?? "unavailable");
      return res.data;
    },
    refetchInterval: 15_000,
    retry: false,
  });

  const active = data?.live?.mcpSessionsActive ?? 0;

  return (
    <div className="flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <Radio className="h-3.5 w-3.5" />
      {active > 0 ? `${active} live MCP session${active === 1 ? "" : "s"}` : "Ready to connect"}
    </div>
  );
}

function ConnectionPageInner() {
  const params = useSearchParams();
  const sectionParam = params.get("section");
  const initialSection: ConnectionSectionId =
    sectionParam === "keys" || sectionParam === "mcp" || sectionParam === "endpoints"
      ? sectionParam
      : "endpoints";

  const { data: user, isLoading } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const res = await apiFetch<{ role: string }>("/api/auth/login");
      if (!res.success || !res.data) throw new Error(res.error ?? "Not authenticated");
      return res.data;
    },
  });

  const tier = user?.role === "master" ? "master" : "user";

  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">Loading connection center…</div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Connection</h1>
          <p className="mt-1 text-sm text-muted-foreground/80">
            MCP endpoints, API keys, OAuth, and protocol setup — one place for every integration
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveStatusBadge />
          <div className="flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
            <Plug className="h-3.5 w-3.5" />
            {tier === "master" ? "Master access" : "Platform connectors"}
          </div>
        </div>
      </motion.div>

      <div className="rounded-2xl border border-border/40 bg-gradient-to-br from-muted/30 via-background to-violet-500/[0.03] p-4 sm:p-6">
        <ConnectionPanel tier={tier} initialSection={initialSection} />
      </div>
    </div>
  );
}

export default function ConnectionPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-muted-foreground">Loading connection center…</div>
      }
    >
      <ConnectionPageInner />
    </Suspense>
  );
}
