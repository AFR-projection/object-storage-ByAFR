"use client";

import Link from "next/link";
import {
  ArrowRight,
  Key,
  Plug,
  Webhook,
  Boxes,
  ExternalLink,
  Copy,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  methodsForTier,
  type ConnectionMethodId,
  getIntegrationsBaseUrl,
} from "@/lib/integrations/catalog";
import { McpSetupSection } from "@/components/settings/mcp-setup-section";

const ICONS: Record<ConnectionMethodId, typeof Key> = {
  api: Key,
  mcp: Plug,
  webhooks: Webhook,
  openapi: Boxes,
};

const GRADIENTS: Record<ConnectionMethodId, string> = {
  api: "from-sky-500/20 to-blue-600/10 border-sky-500/30",
  mcp: "from-violet-500/20 to-purple-600/10 border-violet-500/30",
  webhooks: "from-emerald-500/20 to-teal-600/10 border-emerald-500/30",
  openapi: "from-amber-500/20 to-orange-600/10 border-amber-500/30",
};

type ConnectionHubProps = {
  tier: "user" | "master";
  apiKeyHint?: "sk_" | "skm_";
};

export function ConnectionHub({ tier, apiKeyHint = tier === "master" ? "skm_" : "sk_" }: ConnectionHubProps) {
  const baseUrl = getIntegrationsBaseUrl(typeof window !== "undefined" ? window.location.origin : undefined);
  const methods = methodsForTier(tier);

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-5 text-sm space-y-3">
        <div>
          <p className="font-medium">Universal — semua platform yang support protokolnya</p>
          <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
            Bukan daftar platform tertentu. Kalau tool/app kamu support{" "}
            <strong className="text-foreground">REST + Bearer</strong>,{" "}
            <strong className="text-foreground">MCP</strong>,{" "}
            <strong className="text-foreground">OpenAPI 3.0</strong>, atau{" "}
            <strong className="text-foreground">Webhook POST</strong> — langsung bisa connect ke website ini.
          </p>
        </div>
        <div>
          <p className="font-medium text-xs">Satu akun = satu koneksi pribadi</p>
          <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
            Setiap user punya API key sendiri. Master: <code className="text-amber-400">skm_</code>, user:{" "}
            <code className="text-sky-400">sk_</code>. Permission & data mengikuti akun key tersebut.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {methods.map((method) => {
          const Icon = ICONS[method.id];
          return (
            <Card
              key={method.id}
              id={method.id}
              className={cn("overflow-hidden border bg-gradient-to-br p-4 sm:p-5", GRADIENTS[method.id])}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/50">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{method.name}</p>
                  <p className="text-xs text-muted-foreground">{method.subtitle}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{method.description}</p>
              <p className="mt-2 text-[10px] font-medium text-muted-foreground/80">
                Platform compatible jika support:
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {method.compatibility.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-background/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {method.settingsPath && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
                    <Link href={method.settingsPath}>
                      Setup
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                )}
                {method.docsPath && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => window.open(`${baseUrl}${method.docsPath}`, "_blank")}
                  >
                    Open spec
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div id="mcp-setup">
        <h2 className="mb-3 text-lg font-semibold">MCP — quick setup</h2>
        <McpSetupSection
          apiUrl={baseUrl}
          keyPlaceholder={`YOUR_${apiKeyHint.toUpperCase()}KEY`}
          variant={tier}
        />
      </div>

      <div id="connect-manifest">
        <h2 className="mb-3 text-lg font-semibold">Connection manifest</h2>
        <Card className="border-sky-500/20 bg-sky-500/5 p-4 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Peta machine-readable semua metode koneksi + syarat protokol (bukan daftar brand).
            Agent/tool apapun bisa fetch ini setelah auth dengan API key — lalu auto-detect cara connect.
          </p>
          <p className="text-xs font-mono text-muted-foreground break-all">
            {baseUrl}/api/v1/connect
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => navigator.clipboard.writeText(`${baseUrl}/api/v1/connect`)}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy manifest URL
          </Button>
        </Card>
      </div>

      <div id="openapi-plugins">
        <h2 className="mb-3 text-lg font-semibold">OpenAPI & Plugins</h2>
        <Card className="border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">OpenAPI</strong> = spesifikasi universal. Semua tool yang bisa import
            OpenAPI 3.0 + Bearer auth otomatis connect — tanpa plugin khusus di server kita. Webhook = outbound
            (website kirim event ke URL kamu).
          </p>
          <p className="text-xs font-mono text-muted-foreground break-all">
            {baseUrl}/api/v1/openapi
          </p>
          <p className="text-[10px] text-muted-foreground">
            Requires Bearer API key in request. Master keys get admin paths included in spec.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => navigator.clipboard.writeText(`${baseUrl}/api/v1/openapi`)}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy OpenAPI URL
          </Button>
        </Card>
      </div>
    </div>
  );
}
