"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle2,
  Copy,
  Key,
  Loader2,
  Plus,
  Shield,
  Trash2,
  Zap,
  BookOpen,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";
import { cn, formatDate } from "@/lib/utils";
import { McpSetupSection } from "@/components/settings/mcp-setup-section";

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | Date | null;
  expiresAt: string | Date | null;
  createdAt: string | Date;
};

type ApiKeyPreset = "ai_agent" | "read_only" | "upload_bot" | "full_access";

type ApiKeysMeta = {
  presets: Record<
    ApiKeyPreset,
    { name: string; description: string; scopes: string[]; expiresInDays: number | null }
  >;
  docs: {
    baseUrl: string;
    authentication: { header: string };
    quickStart: { verify: string; listFiles: string };
    aiAgentConfig: Record<string, string>;
  };
};

const SCOPE_OPTIONS = [
  { id: "read", label: "Read", hint: "List, search, metadata" },
  { id: "upload", label: "Upload", hint: "Presign + complete flow" },
  { id: "download", label: "Download", hint: "Files & zip" },
  { id: "write", label: "Write", hint: "Rename, move, notes" },
  { id: "delete", label: "Delete", hint: "Remove files" },
  { id: "full", label: "Full", hint: "All API access" },
] as const;

const PRESET_CARDS: {
  id: ApiKeyPreset;
  icon: typeof Bot;
  recommended?: boolean;
}[] = [
  { id: "ai_agent", icon: Bot, recommended: true },
  { id: "read_only", icon: BookOpen },
  { id: "upload_bot", icon: Zap },
  { id: "full_access", icon: Shield },
];

const EXPIRY_OPTIONS = [
  { label: "Never", value: null },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "1 year", value: 365 },
] as const;

function formatRelative(date: string | Date | null): string {
  if (!date) return "Never";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = d.getTime() - Date.now();
  if (diff < 0) return "Expired";
  const days = Math.ceil(diff / 86400000);
  if (days <= 1) return "Expires today";
  if (days < 30) return `Expires in ${days}d`;
  return formatDate(d, "short");
}

function buildAiPrompt(baseUrl: string, apiKey: string): string {
  return [
    "Storage API connection:",
    `- Base URL: ${baseUrl}`,
    `- API Key: ${apiKey}`,
    `- Auth: Authorization: Bearer ${apiKey}`,
    `- Verify: GET ${baseUrl}/api/v1/me`,
    `- Docs: GET ${baseUrl}/api/v1/docs`,
    "",
    "Always send the Authorization header on every request.",
    "Call /api/v1/me first to confirm granted scopes.",
  ].join("\n");
}

type ApiKeysSectionProps = {
  /** Hide MCP block when rendered inside the Connection panel (MCP has its own tab). */
  hideMcpSetup?: boolean;
};

export function ApiKeysSection({ hideMcpSetup = false }: ApiKeysSectionProps) {
  const [tab, setTab] = useState<"create" | "guide" | "keys">("create");
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [preset, setPreset] = useState<ApiKeyPreset>("ai_agent");
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read", "upload", "download", "write"]);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(90);
  const [createdRaw, setCreatedRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testKey, setTestKey] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const res = await apiFetch<{ keys: ApiKeyRow[] } & ApiKeysMeta>("/api/settings/api-keys");
      if (!res.success) throw new Error(res.error ?? "Failed to load");
      return res.data!;
    },
  });

  const meta = data as (typeof data & ApiKeysMeta) | undefined;
  const baseUrl = meta?.docs?.baseUrl || (typeof window !== "undefined" ? window.location.origin : "");

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload =
        mode === "preset"
          ? { preset, name: name.trim() || undefined, expiresInDays }
          : { name: name.trim(), scopes, expiresInDays };

      const res = await apiFetch<{ key: ApiKeyRow & { rawKey: string } }>("/api/settings/api-keys", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.success) throw new Error(res.error ?? "Failed to create");
      return res.data!.key;
    },
    onSuccess: (key) => {
      setCreatedRaw(key.rawKey);
      setTestKey(key.rawKey);
      setName("");
      setError(null);
      setTab("guide");
      refetch();
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch("/api/settings/api-keys", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      if (!res.success) throw new Error(res.error ?? "Failed to delete");
    },
    onSuccess: () => refetch(),
  });

  const selectedPreset = meta?.presets?.[preset];

  const aiPrompt = useMemo(() => {
    if (!createdRaw) return null;
    return buildAiPrompt(baseUrl, createdRaw);
  }, [baseUrl, createdRaw]);

  function toggleScope(scope: string) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

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
      const username = json.data?.user?.username ?? "unknown";
      const scopeList = (json.data?.apiKey?.scopes ?? []).join(", ") || "session";
      setTestResult({ ok: true, message: `Connected as ${username} · scopes: ${scopeList}` });
    } catch {
      setTestResult({ ok: false, message: "Network error — check URL and key" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-surface-hover/50 p-1">
        {(
          [
            ["create", "Create"],
            ["guide", "Integration"],
            ["keys", "My Keys"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "create" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-surface-hover/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Plug & play — any platform</p>
            <p className="mt-1">
              Create a key → copy config → paste into your client (MCP / HTTP / OpenAPI). Standard auth:{" "}
              <code className="text-accent">Authorization: Bearer sk_…</code> — any platform that supports Bearer
              can connect.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("preset")}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-xs font-medium",
                mode === "preset" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground"
              )}
            >
              Quick preset
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-xs font-medium",
                mode === "custom" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground"
              )}
            >
              Custom scopes
            </button>
          </div>

          {mode === "preset" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {PRESET_CARDS.map(({ id, icon: Icon, recommended }) => {
                const info = meta?.presets?.[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setPreset(id);
                      if (info?.expiresInDays !== undefined) setExpiresInDays(info.expiresInDays);
                    }}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      preset === id
                        ? "border-accent bg-accent/5"
                        : "border-border hover:border-accent/40"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {info?.name ?? id}
                          {recommended && (
                            <span className="ml-1.5 text-[10px] font-normal text-accent">Recommended</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{info?.description}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground/80">
                          {(info?.scopes ?? []).join(" · ")}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {SCOPE_OPTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleScope(s.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-xs",
                    scopes.includes(s.id)
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted-foreground"
                  )}
                >
                  <span className="font-medium capitalize">{s.label}</span>
                  <span className="mt-0.5 block text-[10px] opacity-70">{s.hint}</span>
                </button>
              ))}
            </div>
          )}

          <Input
            placeholder={mode === "preset" ? `Optional name (default: ${selectedPreset?.name ?? "AI Agent"})` : "Key name"}
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
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            disabled={
              createMutation.isPending ||
              (mode === "custom" && (!name.trim() || scopes.length === 0))
            }
            className="w-full"
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create API Key
          </Button>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}

      {tab === "guide" && (
        <div className="space-y-4">
          {createdRaw && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                Copy now — key shown once
              </div>
              <code className="block break-all text-xs">{createdRaw}</code>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => navigator.clipboard.writeText(createdRaw)}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy key
                </Button>
                {aiPrompt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => navigator.clipboard.writeText(aiPrompt)}
                  >
                    <Bot className="mr-1.5 h-3.5 w-3.5" />
                    Copy for AI agent
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <p className="text-xs font-medium">Test connection</p>
            <div className="flex gap-2">
              <Input
                placeholder="Paste sk_… key to test"
                value={testKey}
                onChange={(e) => setTestKey(e.target.value)}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={testing || !testKey.trim()}
                onClick={testConnection}
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
              </Button>
            </div>
            {testResult && (
              <p className={cn("flex items-center gap-1.5 text-xs", testResult.ok ? "text-emerald-500" : "text-danger")}>
                {testResult.ok && <CheckCircle2 className="h-3.5 w-3.5" />}
                {testResult.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">Quick setup</p>
            <div className="rounded-lg bg-surface-hover/50 p-3 text-xs">
              <p className="text-muted-foreground">Base URL</p>
              <code className="block break-all">{baseUrl}</code>
              <p className="mt-2 text-muted-foreground">Auth header</p>
              <code className="block break-all">Authorization: Bearer sk_YOUR_KEY</code>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">Verify with curl</p>
            <pre className="overflow-x-auto rounded-lg bg-surface-hover/50 p-3 text-[11px] leading-relaxed">
              {meta?.docs?.quickStart?.verify?.replace("sk_YOUR_KEY", "sk_…") ??
                `curl -s "${baseUrl}/api/v1/me" -H "Authorization: Bearer sk_…"`}
            </pre>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() =>
                navigator.clipboard.writeText(
                  meta?.docs?.quickStart?.verify ??
                    `curl -s "${baseUrl}/api/v1/me" -H "Authorization: Bearer sk_YOUR_KEY"`
                )
              }
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy curl
            </Button>
          </div>

          {!hideMcpSetup && (
            <McpSetupSection
              apiUrl={baseUrl}
              keyPlaceholder={createdRaw ?? "YOUR_SK_KEY"}
              variant="user"
            />
          )}

          <div className="rounded-lg border border-border/40 p-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Shield className="h-3.5 w-3.5 text-accent" />
              Security tips
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>Never share keys in public repos or chat logs</li>
              <li>Use presets with minimal scopes (AI Agent avoids delete by default)</li>
              <li>Set expiration for temporary integrations</li>
              <li>Revoke immediately if a key is exposed</li>
              <li>Failed auth is rate-limited (20 attempts / 15 min per key)</li>
            </ul>
          </div>
        </div>
      )}

      {tab === "keys" && (
        <div className="space-y-2">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (data?.keys ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              <Key className="mx-auto mb-2 h-5 w-5 opacity-50" />
              No API keys yet. Create one to connect external tools.
            </div>
          ) : (
            (data?.keys ?? []).map((k) => (
              <div
                key={k.id}
                className="rounded-lg border border-border/60 bg-surface-hover/30 px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{k.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{k.keyPrefix}…</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {k.scopes.join(" · ")}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground/70">
                      Created {formatDate(k.createdAt, "short")}
                      {k.lastUsedAt ? ` · Last used ${formatDate(k.lastUsedAt, "short")}` : " · Never used"}
                      {" · "}
                      {formatRelative(k.expiresAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-danger"
                    onClick={() => {
                      if (confirm(`Revoke "${k.name}"? This cannot be undone.`)) {
                        deleteMutation.mutate(k.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
          <p className="text-[10px] text-muted-foreground">Maximum 10 keys per account</p>
        </div>
      )}
    </div>
  );
}
