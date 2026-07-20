"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Boxes,
  Clock,
  Loader2,
  Plug,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/system/notify-store";

type ConnectedApp = {
  clientId: string;
  clientName: string | null;
  scopes: string[];
  activeTokens: number;
  firstConnectedAt: string;
  lastConnectedAt: string;
  expiresAt: string;
};

const DANGER_SCOPES = new Set([
  "delete",
  "full",
  "supreme",
  "admin",
  "admin:users",
  "admin:settings",
  "admin:shares",
  "admin:email",
]);

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function ConnectedAppsSection() {
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["oauth-connections"],
    queryFn: async () => {
      const res = await apiFetch<{ apps: ConnectedApp[] }>("/api/oauth/connections");
      if (!res.success) throw new Error(res.error ?? "Failed to load connected apps");
      return res.data!;
    },
    refetchInterval: 30_000,
  });

  const apps = data?.apps ?? [];

  async function handleRevoke(clientId: string) {
    setRevoking(clientId);
    setConfirmId(null);
    try {
      const res = await apiFetch<{ revoked: number }>(
        `/api/oauth/connections/${encodeURIComponent(clientId)}`,
        { method: "DELETE" }
      );
      if (!res.success) {
        notify({ title: "Could not revoke access", description: res.error, tone: "warning" });
        return;
      }
      notify({
        title: "Access revoked",
        description: "The app can no longer reach your data until you connect it again.",
        tone: "success",
      });
      await refetch();
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Trust posture strip */}
      <div className="relative overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.07] via-transparent to-violet-500/[0.06] p-4">
        <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-sky-400/10 blur-2xl" />
        <div className="relative flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">Apps connected to your account</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
              These external apps signed in with OAuth and can access your data with the scopes shown.
              Revoke any you don&apos;t recognize — access stops immediately.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Connected apps</p>
          <p className="text-[12px] text-muted-foreground">
            {apps.length} app{apps.length === 1 ? "" : "s"} with active access
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1.5"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : apps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 py-12 text-center">
          <Plug className="mx-auto h-7 w-7 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">No apps connected yet</p>
          <p className="mx-auto mt-1 max-w-xs text-[12px] text-muted-foreground">
            When you authorize an AI client or plugin via the MCP connector, it will appear here so
            you can review or revoke it.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          <AnimatePresence initial={false}>
            {apps.map((app, index) => (
              <motion.li
                key={app.clientId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ delay: index * 0.04, duration: 0.25 }}
                className="group relative overflow-hidden rounded-2xl border border-border/50 bg-muted/10 p-3.5 transition-colors hover:border-border hover:bg-muted/20"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
                    <Boxes className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold tracking-tight">
                      {app.clientName?.trim() || "Unnamed MCP client"}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground/70">
                      {app.clientId}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {app.scopes.map((scope) => (
                        <span
                          key={scope}
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                            DANGER_SCOPES.has(scope)
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                              : "border-border/60 bg-background/50 text-muted-foreground"
                          )}
                        >
                          {scope}
                        </span>
                      ))}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground/80">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Connected {relativeTime(app.lastConnectedAt)}
                      </span>
                      <span>Expires {relativeTime(app.expiresAt)}</span>
                      {app.activeTokens > 1 && <span>{app.activeTokens} active tokens</span>}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground opacity-70 transition-opacity hover:text-rose-500 group-hover:opacity-100"
                    disabled={revoking === app.clientId}
                    onClick={() => setConfirmId(app.clientId)}
                    title="Revoke access"
                  >
                    {revoking === app.clientId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <AnimatePresence>
                  {confirmId === app.clientId && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 overflow-hidden"
                    >
                      <div className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-medium">
                            Revoke access for this app?
                          </p>
                          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                            Its tokens stop working immediately. It can reconnect later only if you
                            authorize it again.
                          </p>
                          <div className="mt-2.5 flex gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7"
                              onClick={() => handleRevoke(app.clientId)}
                            >
                              Revoke access
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7"
                              onClick={() => setConfirmId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
