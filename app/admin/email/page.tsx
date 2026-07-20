"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Plus,
  Trash2,
  Loader2,
  X,
  ShieldCheck,
  AlertTriangle,
  Send,
  RefreshCw,
  Eye,
  EyeOff,
  ScrollText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type MailStatus = "unverified" | "ok" | "error";
type MailSenderRow = {
  id: string;
  email: string;
  displayName: string;
  fromName: string;
  status: MailStatus;
  isActive: boolean;
  lastError: string | null;
  lastVerifiedAt: string | null;
  priority: number;
  dailyLimit: number;
  dailySentCount: number;
  sentCountResetAt: string | null;
  lastUsedAt: string | null;
  consecutiveFailures: number;
  cooldownUntil: string | null;
};

type VerifyResult = { ok: boolean; error?: string };

/** A "now" timestamp that ticks on an interval, so time-based UI stays live
 *  without calling Date.now() during render (which must stay pure). */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function EmailSettings() {
  const now = useNow();
  const [showAddModal, setShowAddModal] = useState(false);
  const [email, setEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fromName, setFromName] = useState("Storage ByAFR");
  const [showPw, setShowPw] = useState(false);
  const [formError, setFormError] = useState("");
  const queryClient = useQueryClient();

  const { data: senders = [], isLoading } = useQuery({
    queryKey: ["mail-senders"],
    queryFn: async () => {
      const res = await apiFetch<MailSenderRow[]>("/api/admin/email/senders");
      return res.data ?? [];
    },
    refetchInterval: 10000,
  });

  // Global default daily limit, so a sender with dailyLimit=0 shows the right cap.
  const { data: health } = useQuery({
    queryKey: ["mail-health"],
    queryFn: async () => {
      const res = await apiFetch<MailHealth>("/api/admin/email/health");
      if (!res.success || !res.data) throw new Error(res.error ?? "unavailable");
      return res.data;
    },
    refetchInterval: 15000,
  });
  const defaultDailyLimit = health?.defaultDailyLimit ?? 400;

  const resetForm = () => {
    setEmail("");
    setAppPassword("");
    setDisplayName("");
    setFromName("Storage ByAFR");
    setShowPw(false);
    setFormError("");
  };

  const addSender = useMutation({
    mutationFn: async () => {
      const res = await apiFetch<MailSenderRow & { verify: VerifyResult }>(
        "/api/admin/email/senders",
        {
          method: "POST",
          body: JSON.stringify({ email, appPassword, displayName, fromName }),
        }
      );
      if (!res.success) throw new Error(res.error ?? "Failed to add sender");
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["mail-senders"] });
      queryClient.invalidateQueries({ queryKey: ["mail-health"] });
      if (data && !data.verify.ok) {
        // Saved, but Gmail rejected the login — keep the modal open with the reason.
        setFormError(data.verify.error ?? "Gmail rejected the login");
        return;
      }
      setShowAddModal(false);
      resetForm();
    },
    onError: (err) => setFormError((err as Error).message),
  });

  const verifySender = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch<{ verify: VerifyResult }>("/api/admin/email/verify", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      if (!res.success) throw new Error(res.error ?? "Verify failed");
      return res.data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["mail-senders"] }),
  });

  const deleteSender = useMutation({
    mutationFn: async (id: string) => {
      await apiFetch("/api/admin/email/senders", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mail-senders"] });
      queryClient.invalidateQueries({ queryKey: ["mail-health"] });
    },
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Email Gateway"
        subtitle="Manage Gmail senders for delivering OTP & security notifications"
        actions={
          <Button onClick={() => { resetForm(); setShowAddModal(true); }} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Gmail Sender
          </Button>
        }
      />

      <MailHealthPanel />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : senders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No Gmail sender yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {senders.map((sender) => (
            <motion.div key={sender.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <StatusDot status={sender.status} />
                        <h3 className="font-semibold text-lg">{sender.displayName}</h3>
                        <span className="text-sm px-2 py-1 bg-muted rounded font-mono">
                          {sender.email}
                        </span>
                        {!sender.isActive && (
                          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                            inactive
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium">{statusText(sender.status)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        From name: {sender.fromName}
                      </p>
                      {sender.status === "error" && sender.lastError && (
                        <p className="text-xs text-red-600 mt-1 max-w-xl">{sender.lastError}</p>
                      )}
                      <SenderUsage sender={sender} defaultLimit={defaultDailyLimit} now={now} />
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => verifySender.mutate(sender.id)}
                        disabled={verifySender.isPending}
                        title="Re-test this sender"
                      >
                        {verifySender.isPending && verifySender.variables === sender.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        Test
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => deleteSender.mutate(sender.id)}
                        disabled={deleteSender.isPending}
                        title="Delete"
                      >
                        {deleteSender.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <EmailActivityLog />

      {/* Add Sender Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-background rounded-lg p-6 w-full max-w-md border"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Add Gmail Sender</h2>
                <button onClick={() => setShowAddModal(false)}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 mb-5">
                <div>
                  <label className="block text-sm font-medium mb-2">Display Name</label>
                  <Input
                    placeholder="e.g. Main Sender"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Gmail Address</label>
                  <Input
                    type="email"
                    placeholder="you@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">App Password</label>
                  <div className="relative">
                    <Input
                      type={showPw ? "text" : "password"}
                      placeholder="16-character app password"
                      value={appPassword}
                      onChange={(e) => setAppPassword(e.target.value)}
                      className="pr-10 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">From Name</label>
                  <Input
                    placeholder="Storage ByAFR"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                  />
                </div>

                <div className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-950 p-3 rounded space-y-1">
                  <p className="font-semibold">How to get a Gmail App Password:</p>
                  <p>1. Enable 2-Step Verification on the Google account.</p>
                  <p>
                    2. Go to Google Account → Security → App passwords, create one for
                    &quot;Mail&quot;, and paste the 16-character code here.
                  </p>
                </div>
              </div>

              {formError && <p className="text-sm text-red-500 mb-4">{formError}</p>}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowAddModal(false)} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={() => { setFormError(""); addSender.mutate(); }}
                  disabled={!email || !appPassword || !displayName || addSender.isPending}
                  className="flex-1 gap-2"
                >
                  {addSender.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Verify &amp; Save
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusDot({ status }: { status: MailStatus }) {
  const color =
    status === "ok" ? "bg-green-500" : status === "error" ? "bg-red-500" : "bg-gray-400";
  return <span className={cn("w-3 h-3 rounded-full", color)} />;
}

/** Daily-usage bar + live router state (cooldown / failure streak) for one sender. */
function SenderUsage({ sender, defaultLimit, now }: { sender: MailSenderRow; defaultLimit: number; now: number }) {
  const limit = sender.dailyLimit > 0 ? sender.dailyLimit : defaultLimit;

  // The stored count only counts within the current 24h window; treat an expired
  // window as zero so the bar matches what the router actually sees.
  const windowActive =
    sender.sentCountResetAt &&
    now - new Date(sender.sentCountResetAt).getTime() < 24 * 60 * 60 * 1000;
  const used = windowActive ? sender.dailySentCount : 0;
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));

  const cooling =
    sender.cooldownUntil && new Date(sender.cooldownUntil).getTime() > now
      ? sender.cooldownUntil
      : null;
  const cooldownMins = cooling
    ? Math.max(1, Math.ceil((new Date(cooling).getTime() - now) / 60000))
    : 0;

  const barColor = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="mt-2.5 max-w-md space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Daily usage</span>
        <span className="font-mono">
          {used} / {limit}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {cooling && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" /> Resting ~{cooldownMins}m
          </span>
        )}
        {!cooling && pct >= 100 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
            Daily limit reached
          </span>
        )}
        {sender.consecutiveFailures > 0 && !cooling && (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {sender.consecutiveFailures} recent failure{sender.consecutiveFailures > 1 ? "s" : ""}
          </span>
        )}
        {sender.lastUsedAt && (
          <span className="text-[10px] text-muted-foreground/60">
            last used {new Date(sender.lastUsedAt).toLocaleString("en-GB")}
          </span>
        )}
      </div>
    </div>
  );
}

function statusText(status: MailStatus): string {
  return status === "ok"
    ? "🟢 Verified & ready"
    : status === "error"
      ? "🔴 Login failed"
      : "⚫ Not verified yet";
}

// ─── Email health panel ───────────────────────────────────────────────────────

type MailHealth = {
  healthy: boolean;
  totalSenders: number;
  activeSenders: number;
  readySenders: number;
  eligibleSenders: number;
  coolingSenders: number;
  defaultDailyLimit: number;
  problems: string[];
};

function MailHealthPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["mail-health"],
    queryFn: async () => {
      const res = await apiFetch<MailHealth>("/api/admin/email/health");
      if (!res.success || !res.data) throw new Error(res.error ?? "unavailable");
      return res.data;
    },
    refetchInterval: 15000,
  });

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking email health…
        </CardContent>
      </Card>
    );
  }

  const ok = data.healthy;

  return (
    <Card
      className={cn(
        "border",
        ok ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-amber-500/30 bg-amber-500/[0.05]"
      )}
    >
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl",
              ok
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            )}
          >
            {ok ? <ShieldCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {ok ? "Email gateway healthy" : "Email gateway needs attention"}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.eligibleSenders} ready now · {data.readySenders} verified
              {data.coolingSenders > 0 ? ` · ${data.coolingSenders} resting` : ""} ·{" "}
              {data.totalSenders} total
            </p>
          </div>
        </div>

        {data.problems.length > 0 && (
          <ul className="space-y-1.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3">
            {data.problems.map((p, i) => (
              <li key={i} className="flex gap-2 text-[12px] text-amber-800 dark:text-amber-100/90">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                {p}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Recent email activity ────────────────────────────────────────────────────

type EmailLogEntry = {
  ts: number;
  level: "info" | "warn" | "error";
  type: "verify" | "send" | "deliver" | "otp";
  message: string;
  meta?: Record<string, unknown>;
};

function EmailActivityLog() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["mail-logs"],
    queryFn: async () => {
      const res = await apiFetch<{ entries: EmailLogEntry[] }>("/api/admin/email/logs?limit=100");
      if (!res.success || !res.data) throw new Error(res.error ?? "unavailable");
      return res.data.entries;
    },
    refetchInterval: 5000,
  });

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Recent email activity</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
          </div>
        ) : !data || data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No email activity yet. Sends, verifications, and OTP events will appear here.
          </p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
            {data.map((e, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2 rounded px-2 py-1",
                  e.level === "error"
                    ? "bg-red-500/[0.06] text-red-600 dark:text-red-400"
                    : e.level === "warn"
                      ? "bg-amber-500/[0.06] text-amber-700 dark:text-amber-400"
                      : "text-muted-foreground"
                )}
              >
                <span className="shrink-0 opacity-60">
                  {new Date(e.ts).toLocaleTimeString("en-GB")}
                </span>
                <span className="shrink-0 font-semibold uppercase opacity-80">{e.type}</span>
                <span className="min-w-0 break-words">{e.message}</span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-2 text-[10px] text-muted-foreground/60">
          Live tail from this server process (last 100 events, resets on restart). Full history is in
          the server logs.
        </p>
      </CardContent>
    </Card>
  );
}
