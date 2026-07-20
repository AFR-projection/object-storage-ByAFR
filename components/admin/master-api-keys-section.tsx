"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle2,
  Copy,
  Crown,
  KeyRound,
  Loader2,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";
import { cn, formatDate } from "@/lib/utils";

function buildMasterAiPrompt(baseUrl: string, apiKey: string): string {
  return [
    "MASTER Storage Platform API — SUPREME ACCESS",
    `- Base URL: ${baseUrl}`,
    `- Master API Key: ${apiKey}`,
    `- Auth: Authorization: Bearer ${apiKey}`,
    `- Verify: GET ${baseUrl}/api/v1/me`,
    `- Admin Stats: GET ${baseUrl}/api/admin/stats`,
    `- Admin Users: GET ${baseUrl}/api/admin/users`,
    "",
    "This is a MASTER key with elevated platform permissions.",
    "Scope 'supreme' grants unrestricted access to all storage + admin APIs.",
    "Always send Authorization header. Never expose this key publicly.",
  ].join("\n");
}

type MasterKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | Date | null;
  expiresAt: string | Date | null;
  createdAt: string | Date;
};

type MasterPreset = "supreme_command" | "platform_ai" | "ops_center" | "user_governor" | "automation_god";

type MasterMeta = {
  presets: Record<
    MasterPreset,
    { name: string; description: string; scopes: string[]; expiresInDays: number | null }
  >;
  maxKeys: number;
  docs: { baseUrl: string; quickStart: { verify: string; stats: string } };
};

const PRESET_ICONS: Record<MasterPreset, typeof Crown> = {
  supreme_command: Crown,
  platform_ai: Bot,
  ops_center: Shield,
  user_governor: KeyRound,
  automation_god: Sparkles,
};

const EXPIRY_OPTIONS = [
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "1 year", value: 365 },
  { label: "Never", value: null },
] as const;

function formatRelative(date: string | Date | null): string {
  if (!date) return "Never expires";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = d.getTime() - Date.now();
  if (diff < 0) return "Expired";
  const days = Math.ceil(diff / 86400000);
  if (days <= 1) return "Expires today";
  if (days < 30) return `Expires in ${days}d`;
  return formatDate(d, "short");
}

function scopeBadgeClass(scope: string): string {
  if (scope === "supreme") return "border-amber-500/40 bg-amber-500/15 text-amber-400";
  if (scope.startsWith("admin")) return "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300";
  return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
}

type MasterApiKeysSectionProps = {
  onKeyCreated?: (rawKey: string) => void;
};

export function MasterApiKeysSection({ onKeyCreated }: MasterApiKeysSectionProps) {
  const [view, setView] = useState<"create" | "vault">("create");
  const [preset, setPreset] = useState<MasterPreset>("supreme_command");
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number | null>(90);
  const [createdRaw, setCreatedRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testKey, setTestKey] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["master-api-keys"],
    queryFn: async () => {
      const res = await apiFetch<{ keys: MasterKeyRow[] } & MasterMeta>("/api/admin/api-keys");
      if (!res.success) throw new Error(res.error ?? "Failed to load");
      return res.data!;
    },
  });

  const baseUrl = data?.docs?.baseUrl || (typeof window !== "undefined" ? window.location.origin : "");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch<{ key: MasterKeyRow & { rawKey: string; tier: string } }>(
        "/api/admin/api-keys",
        {
          method: "POST",
          body: JSON.stringify({ preset, name: name.trim() || undefined, expiresInDays }),
        }
      );
      if (!res.success) throw new Error(res.error ?? "Failed to create");
      return res.data!.key;
    },
    onSuccess: (key) => {
      setCreatedRaw(key.rawKey);
      setTestKey(key.rawKey);
      setName("");
      setError(null);
      onKeyCreated?.(key.rawKey);
      refetch();
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch("/api/admin/api-keys", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      if (!res.success) throw new Error(res.error ?? "Failed to revoke");
    },
    onSuccess: () => refetch(),
  });

  const aiPrompt = useMemo(() => {
    if (!createdRaw) return null;
    return buildMasterAiPrompt(baseUrl, createdRaw);
  }, [baseUrl, createdRaw]);

  async function testConnection() {
    const key = testKey.trim();
    if (!key) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${baseUrl}/api/v1/me`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setTestResult({ ok: false, message: json.error ?? "Connection failed" });
        return;
      }
      const tier = json.data?.tier ?? "unknown";
      const supreme = json.data?.apiKey?.hasSupreme ? " · SUPREME" : "";
      setTestResult({
        ok: true,
        message: `Connected · tier: ${tier}${supreme} · role: ${json.data?.user?.role}`,
      });
    } catch {
      setTestResult({ ok: false, message: "Network error" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-500/15 bg-gradient-to-r from-amber-500/[0.08] to-transparent p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
            <Zap className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-sm">
            <p className="font-medium text-foreground">Master keys (skm_)</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Programmatic access with admin scopes. User keys use <code className="text-sky-400">sk_</code>;
              master keys use <code className="text-amber-400">skm_</code> for platform control APIs and MCP
              admin tools.
            </p>
          </div>
        </div>
      </div>

      <div className="inline-flex rounded-xl border border-border/50 bg-muted/30 p-1">
        {(
          [
            ["create", "Create key"],
            ["vault", "Key vault"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={cn(
              "rounded-lg px-4 py-2 text-xs font-medium transition-colors",
              view === id
                ? "bg-background text-foreground shadow-sm border border-border/40"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "create" && (
        <Card className="border-border/50 p-5 sm:p-6 space-y-5">
          <div>
            <p className="text-sm font-medium">Power preset</p>
            <p className="text-xs text-muted-foreground mt-0.5">Scoped access for automation and AI agents</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.entries(data?.presets ?? {}) as [MasterPreset, MasterMeta["presets"][MasterPreset]][]).map(
              ([id, info]) => {
                const Icon = PRESET_ICONS[id] ?? Crown;
                const isSupreme = info.scopes.includes("supreme");
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setPreset(id);
                      setExpiresInDays(info.expiresInDays);
                    }}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-all",
                      preset === id
                        ? isSupreme
                          ? "border-amber-500/40 bg-amber-500/[0.08] ring-1 ring-amber-500/20"
                          : "border-violet-500/35 bg-violet-500/[0.06]"
                        : "border-border/50 hover:border-border"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", isSupreme ? "text-amber-400" : "text-violet-400")} />
                      <div>
                        <p className="text-sm font-semibold">{info.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{info.description}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {info.scopes.map((s) => (
                            <span key={s} className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-medium", scopeBadgeClass(s))}>
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              }
            )}
          </div>

          <Input
            placeholder={`Optional label (default: ${data?.presets?.[preset]?.name ?? "Supreme Command"})`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Expiration</p>
            <div className="flex flex-wrap gap-2">
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setExpiresInDays(opt.value)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium",
                    expiresInDays === opt.value
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                      : "border-border/60 text-muted-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white border-0"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create master key
          </Button>

          {error && <p className="text-xs text-danger">{error}</p>}

          {createdRaw && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Copy now — shown once only
              </div>
              <code className="block break-all text-xs font-mono text-foreground/90">{createdRaw}</code>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(createdRaw)}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy key
                </Button>
                {aiPrompt && (
                  <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(aiPrompt)}>
                    <Bot className="mr-1.5 h-3.5 w-3.5" />
                    Copy AI prompt
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border/40 bg-muted/20 p-4 space-y-2">
            <p className="text-xs font-medium">Test REST connection</p>
            <div className="flex gap-2">
              <Input
                placeholder="Paste skm_… key"
                value={testKey}
                onChange={(e) => setTestKey(e.target.value)}
                className="font-mono text-xs"
              />
              <Button variant="ghost" size="sm" disabled={testing || !testKey.trim()} onClick={testConnection}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
              </Button>
            </div>
            {testResult && (
              <p className={cn("flex items-center gap-1.5 text-xs", testResult.ok ? "text-emerald-400" : "text-danger")}>
                {testResult.ok && <CheckCircle2 className="h-3.5 w-3.5" />}
                {testResult.message}
              </p>
            )}
          </div>
        </Card>
      )}

      {view === "vault" && (
        <Card className="border-border/50 p-5 sm:p-6">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (data?.keys ?? []).length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Crown className="mx-auto mb-3 h-8 w-8 text-amber-500/30" />
              No master keys yet. Create one to connect external tools.
            </div>
          ) : (
            <ul className="space-y-3">
              {(data?.keys ?? []).map((k) => (
                <li key={k.id} className="rounded-xl border border-border/40 bg-muted/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{k.name}</p>
                        {k.scopes.includes("supreme") && (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                            SUPREME
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-xs text-amber-400/80 mt-0.5">{k.keyPrefix}…</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {k.scopes.map((s) => (
                          <span key={s} className={cn("rounded border px-1.5 py-0.5 text-[10px]", scopeBadgeClass(s))}>
                            {s}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        Created {formatDate(k.createdAt, "short")}
                        {k.lastUsedAt ? ` · Used ${formatDate(k.lastUsedAt, "short")}` : " · Never used"}
                        {" · "}
                        {formatRelative(k.expiresAt)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-danger hover:bg-danger/10"
                      onClick={() => {
                        if (confirm(`Revoke master key "${k.name}"?`)) deleteMutation.mutate(k.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-[10px] text-muted-foreground">
            Maximum {data?.maxKeys ?? 25} master keys · prefix <code>skm_</code>
          </p>
        </Card>
      )}
    </div>
  );
}
