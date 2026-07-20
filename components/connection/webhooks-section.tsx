"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/system/notify-store";

type WebhookRow = {
  id: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  lastDeliveryAt: string | null;
  lastStatus: number | null;
  createdAt: string;
};

const ALL_EVENTS = ["upload", "delete", "share"] as const;

function statusTone(status: number | null): string {
  if (status === null) return "text-muted-foreground";
  if (status >= 200 && status < 300) return "text-emerald-500";
  if (status >= 400) return "text-red-500";
  return "text-amber-500";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function WebhooksSection() {
  const [creating, setCreating] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>([...ALL_EVENTS]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["webhooks"],
    queryFn: async () => {
      const res = await apiFetch<{ webhooks: WebhookRow[] }>("/api/webhooks");
      if (!res.success) throw new Error(res.error ?? "Failed to load webhooks");
      return res.data!;
    },
  });

  const hooks = data?.webhooks ?? [];

  async function handleCreate() {
    if (!newUrl.trim()) return;
    setBusyId("new");
    try {
      const res = await apiFetch<{ webhook: WebhookRow }>("/api/webhooks", {
        method: "POST",
        body: JSON.stringify({ url: newUrl.trim(), events: newEvents }),
      });
      if (!res.success) {
        notify({ title: "Could not create webhook", description: res.error, tone: "warning" });
        return;
      }
      setNewUrl("");
      setNewEvents([...ALL_EVENTS]);
      setCreating(false);
      notify({ title: "Webhook created", tone: "success" });
      await refetch();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleEnabled(hook: WebhookRow) {
    setBusyId(hook.id);
    try {
      const res = await apiFetch(`/api/webhooks/${hook.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !hook.enabled }),
      });
      if (!res.success) notify({ title: "Update failed", description: res.error, tone: "warning" });
      await refetch();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(hook: WebhookRow) {
    setBusyId(hook.id);
    try {
      const res = await apiFetch(`/api/webhooks/${hook.id}`, { method: "DELETE" });
      if (!res.success) {
        notify({ title: "Delete failed", description: res.error, tone: "warning" });
        return;
      }
      notify({ title: "Webhook deleted", tone: "success" });
      await refetch();
    } finally {
      setBusyId(null);
    }
  }

  async function sendTest(hook: WebhookRow) {
    setBusyId(hook.id);
    try {
      const res = await apiFetch<{ ok: boolean; status: number | null; error: string | null }>(
        `/api/webhooks/${hook.id}/test`,
        { method: "POST" }
      );
      if (res.success && res.data?.ok) {
        notify({ title: `Test delivered (HTTP ${res.data.status})`, tone: "success" });
      } else {
        notify({
          title: "Test failed",
          description: res.data?.error ?? `HTTP ${res.data?.status ?? "error"}`,
          tone: "warning",
        });
      }
      await refetch();
    } finally {
      setBusyId(null);
    }
  }

  async function copySecret(hook: WebhookRow) {
    await navigator.clipboard.writeText(hook.secret);
    setCopied(hook.id);
    setTimeout(() => setCopied(null), 2000);
  }

  function toggleEvent(ev: string) {
    setNewEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]));
  }

  return (
    <div className="space-y-5">
      {/* Intro strip */}
      <div className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.07] via-transparent to-sky-500/[0.06] p-4">
        <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-violet-400/10 blur-2xl" />
        <div className="relative flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
            <Zap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">Outbound webhooks</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
              Get a signed <code className="text-foreground/80">POST</code> to your server the moment
              files change — no polling. Verify the{" "}
              <code className="text-foreground/80">X-Webhook-Signature</code> header (HMAC-SHA256 of
              the body using your secret).
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Your endpoints</p>
          <p className="text-[12px] text-muted-foreground">
            {hooks.length} webhook{hooks.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" className="h-8 gap-1.5" onClick={() => setCreating((c) => !c)}>
            <Plus className="h-3.5 w-3.5" />
            Add webhook
          </Button>
        </div>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/10 p-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Payload URL</label>
                <Input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://your-server.com/webhooks/storage"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Events</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_EVENTS.map((ev) => (
                    <button
                      key={ev}
                      type="button"
                      onClick={() => toggleEvent(ev)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        newEvents.includes(ev)
                          ? "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300"
                          : "border-border/60 text-muted-foreground hover:border-border"
                      )}
                    >
                      {ev}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!newUrl.trim() || newEvents.length === 0 || busyId === "new"}
                  onClick={handleCreate}
                >
                  {busyId === "new" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Create webhook
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : hooks.length === 0 && !creating ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 py-12 text-center">
          <Webhook className="mx-auto h-7 w-7 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">No webhooks yet</p>
          <p className="mx-auto mt-1 max-w-xs text-[12px] text-muted-foreground">
            Add an endpoint to receive real-time events when files are uploaded, deleted, or shared.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          <AnimatePresence initial={false}>
            {hooks.map((hook) => {
              const isRevealed = revealed.has(hook.id);
              return (
                <motion.li
                  key={hook.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-2xl border border-border/50 bg-muted/10 p-3.5"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                        hook.enabled
                          ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                          : "bg-muted/60 text-muted-foreground"
                      )}
                    >
                      <Webhook className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[12.5px] font-medium">{hook.url}</p>

                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {hook.events.map((ev) => (
                          <span
                            key={ev}
                            className="rounded-full border border-border/60 bg-background/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                          >
                            {ev}
                          </span>
                        ))}
                        {!hook.enabled && (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-300">
                            paused
                          </span>
                        )}
                      </div>

                      {/* Secret */}
                      <div className="mt-2 flex items-center gap-1.5">
                        <code className="min-w-0 flex-1 truncate rounded-md bg-neutral-900 px-2 py-1 font-mono text-[10.5px] text-emerald-300/90 ring-1 ring-white/10">
                          {isRevealed ? hook.secret : "whsec_" + "•".repeat(20)}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7"
                          onClick={() =>
                            setRevealed((prev) => {
                              const next = new Set(prev);
                              if (next.has(hook.id)) next.delete(hook.id);
                              else next.add(hook.id);
                              return next;
                            })
                          }
                          title={isRevealed ? "Hide secret" : "Reveal secret"}
                        >
                          {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7"
                          onClick={() => copySecret(hook)}
                          title="Copy secret"
                        >
                          {copied === hook.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground/80">
                        <span>Last delivery {relativeTime(hook.lastDeliveryAt)}</span>
                        {hook.lastStatus !== null && (
                          <span className={cn("font-medium", statusTone(hook.lastStatus))}>
                            HTTP {hook.lastStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 gap-1.5"
                      disabled={busyId === hook.id}
                      onClick={() => sendTest(hook)}
                    >
                      {busyId === hook.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Send test
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      disabled={busyId === hook.id}
                      onClick={() => toggleEnabled(hook)}
                    >
                      {hook.enabled ? "Pause" : "Resume"}
                    </Button>
                    <div className="flex-1" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-muted-foreground hover:text-rose-500"
                      disabled={busyId === hook.id}
                      onClick={() => remove(hook)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <div className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-muted/10 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Always verify the signature before trusting a payload: compute{" "}
          <code className="text-foreground/80">HMAC-SHA256(body, secret)</code> and compare it to the{" "}
          <code className="text-foreground/80">X-Webhook-Signature</code> header. Respond{" "}
          <code className="text-foreground/80">2xx</code> to acknowledge; failures retry automatically.
        </p>
      </div>
    </div>
  );
}
