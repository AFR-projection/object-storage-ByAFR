"use client";

import Link from "next/link";
import {
  ArrowRight,
  Key,
  Plug,
  Webhook,
  Boxes,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  methodsForTier,
  type ConnectionMethodId,
  getIntegrationsBaseUrl,
} from "@/lib/integrations/catalog";
import { ConnectionEndpointsPanel } from "@/components/integrations/connection-endpoints-panel";
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
      <ConnectionEndpointsPanel baseUrl={baseUrl} />

      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-5 text-sm space-y-2">
        <p className="font-medium">Universal — semua platform yang support protokolnya</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          REST + Bearer, MCP + OAuth, OpenAPI, atau Webhook POST — langsung connect. Satu akun = satu key (
          {tier === "master" ? (
            <code className="text-amber-400">skm_</code>
          ) : (
            <code className="text-sky-400">sk_</code>
          )}
          ) kecuali MCP remote yang pakai login OAuth browser.
        </p>
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
                {method.id === "mcp" && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
                    <a href="#mcp-setup">MCP config</a>
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div id="mcp-setup">
        <h2 className="mb-3 text-lg font-semibold">MCP — local & remote setup</h2>
        <McpSetupSection
          apiUrl={baseUrl}
          keyPlaceholder={`YOUR_${apiKeyHint.toUpperCase()}KEY`}
          variant={tier}
        />
      </div>
    </div>
  );
}
