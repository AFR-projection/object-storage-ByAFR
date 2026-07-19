"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Crown, KeyRound, Link2, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { getIntegrationsBaseUrl } from "@/lib/integrations/catalog";
import { ConnectionEndpointsPanel } from "@/components/integrations/connection-endpoints-panel";
import { McpSetupSection } from "@/components/settings/mcp-setup-section";
import { MasterApiKeysSection } from "@/components/admin/master-api-keys-section";
import { ApiKeysSection } from "@/components/settings/api-keys-section";

const SECTIONS = [
  { id: "endpoints", label: "Endpoints", icon: Link2, description: "MCP URL & OAuth discovery" },
  { id: "keys", label: "API keys", icon: KeyRound, description: "Programmatic access tokens" },
  { id: "mcp", label: "MCP setup", icon: Plug, description: "Local stdio & remote OAuth" },
] as const;

export type ConnectionSectionId = (typeof SECTIONS)[number]["id"];

type ConnectionPanelProps = {
  tier: "user" | "master";
  initialSection?: ConnectionSectionId;
};

export function ConnectionPanel({ tier, initialSection = "endpoints" }: ConnectionPanelProps) {
  const [section, setSection] = useState<ConnectionSectionId>(initialSection);
  const [keyPlaceholder, setKeyPlaceholder] = useState(
    tier === "master" ? "YOUR_SKM_KEY" : "YOUR_SK_KEY"
  );
  const baseUrl = getIntegrationsBaseUrl(typeof window !== "undefined" ? window.location.origin : undefined);

  const sections = SECTIONS.map((item) =>
    item.id === "keys" && tier === "master"
      ? { ...item, label: "Master keys", description: "skm_ elevated platform access" }
      : item.id === "keys"
        ? { ...item, description: "sk_ tokens for scripts & automation" }
        : item
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {sections.map((item) => {
          const active = section === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                "relative overflow-hidden rounded-2xl border p-4 text-left transition-colors",
                active
                  ? "border-violet-500/40 bg-violet-500/[0.06] shadow-[0_0_32px_rgba(139,92,246,0.08)]"
                  : "border-border/50 bg-muted/20 hover:border-border hover:bg-muted/30"
              )}
            >
              {active && (
                <motion.div
                  layoutId="connection-section"
                  className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-violet-500/25"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <div className="relative flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    active ? "bg-violet-500/20 text-violet-300" : "bg-background/60 text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{item.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <motion.div
        key={section}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {section === "endpoints" && <ConnectionEndpointsPanel baseUrl={baseUrl} />}
        {section === "keys" &&
          (tier === "master" ? (
            <MasterApiKeysSection onKeyCreated={(raw) => setKeyPlaceholder(raw)} />
          ) : (
            <ApiKeysSection hideMcpSetup />
          ))}
        {section === "mcp" && (
          <div className="space-y-4">
            {tier === "master" && (
              <div className="flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/[0.04] px-4 py-3 text-xs text-muted-foreground">
                <Crown className="h-4 w-4 shrink-0 text-amber-400" />
                Remote MCP connectors use OAuth browser login. Local stdio uses your master key in env.
              </div>
            )}
            <McpSetupSection
              apiUrl={baseUrl}
              keyPlaceholder={keyPlaceholder}
              variant={tier}
            />
          </div>
        )}
      </motion.div>
    </div>
  );
}
