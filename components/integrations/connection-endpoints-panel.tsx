"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Globe,
  Link2,
  Shield,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildConnectionEndpoints,
  primaryMcpUrl,
  WRONG_MCP_URLS,
} from "@/lib/integrations/endpoints";

type ConnectionEndpointsPanelProps = {
  baseUrl: string;
};

const BADGE_STYLES = {
  recommended: "bg-violet-500/20 text-violet-300 border-violet-500/40",
  oauth: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "api-key": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  reference: "bg-muted/40 text-muted-foreground border-border/50",
};

export function ConnectionEndpointsPanel({ baseUrl }: ConnectionEndpointsPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const mcpUrl = primaryMcpUrl(baseUrl);
  const endpoints = useMemo(() => buildConnectionEndpoints(baseUrl), [baseUrl]);

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Hero — MCP URL */}
      <Card className="relative overflow-hidden border-violet-500/40 bg-gradient-to-br from-violet-600/20 via-violet-500/10 to-background p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-violet-500/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">
                URL utama — MCP Connector
              </p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Paste <strong className="text-foreground">hanya URL ini</strong> di form MCP connector / plugin.
              OAuth login otomatis — jangan pakai /connect atau /openapi.
            </p>
            <code className="block break-all rounded-lg bg-black/40 px-3 py-2.5 text-sm font-mono text-emerald-300/95 ring-1 ring-violet-500/30">
              {mcpUrl}
            </code>
          </div>
          <Button
            size="sm"
            className="shrink-0 bg-violet-600 hover:bg-violet-500 text-white"
            onClick={() => copy(mcpUrl, "mcp-primary")}
          >
            {copied === "mcp-primary" ? (
              <Check className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Copy className="mr-1.5 h-3.5 w-3.5" />
            )}
            Copy MCP URL
          </Button>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2 text-[10px]">
          <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-violet-200">
            <Shield className="h-3 w-3" /> OAuth 2.1 + PKCE
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/40 px-2 py-0.5 text-muted-foreground">
            <Globe className="h-3 w-3" /> Streamable HTTP
          </span>
        </div>
      </Card>

      {/* Endpoint table */}
      <Card className="overflow-hidden border-border/60">
        <div className="border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Semua endpoint koneksi</p>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Setiap baris = fungsi berbeda. Jangan campur URL MCP dengan OpenAPI/manifest.
          </p>
        </div>
        <div className="divide-y divide-border/40">
          {endpoints.map((ep) => {
            const url = `${baseUrl.replace(/\/$/, "")}${ep.path}`;
            const badge = ep.badge ?? "reference";
            return (
              <div
                key={ep.id}
                className={cn(
                  "flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5",
                  ep.primary && "bg-violet-500/[0.03]"
                )}
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{ep.label}</p>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide",
                        BADGE_STYLES[badge]
                      )}
                    >
                      {ep.primary ? "pakai ini" : badge.replace("-", " ")}
                    </span>
                    {ep.avoidForMcp && (
                      <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] text-red-300">
                        bukan MCP URL
                      </span>
                    )}
                  </div>
                  <code className="block break-all text-[11px] font-mono text-muted-foreground">{url}</code>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <span className="text-foreground/80">Auth:</span> {ep.auth}
                    <span className="mx-1.5 text-border">·</span>
                    {ep.useFor}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 self-start sm:self-center"
                  onClick={() => copy(url, ep.id)}
                >
                  {copied === ep.id ? (
                    <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Copy
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Wrong URLs warning */}
      <Card className="border-red-500/25 bg-red-500/[0.04] p-4 sm:p-5">
        <div className="flex items-start gap-2">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="space-y-2 min-w-0">
            <p className="text-sm font-medium text-red-200">Jangan paste ke form MCP connector</p>
            <ul className="space-y-1.5 text-[11px] text-muted-foreground">
              {WRONG_MCP_URLS.map((item) => (
                <li key={item.path} className="flex flex-wrap gap-x-1">
                  <code className="text-red-300/90">{baseUrl.replace(/\/$/, "")}{item.path}</code>
                  <span>— {item.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
