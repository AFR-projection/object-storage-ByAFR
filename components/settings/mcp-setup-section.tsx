"use client";

import { useMemo, useState } from "react";
import { Copy, Globe, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  generateRemoteMcpInstructions,
  generateMcpServerConfig,
  getRemoteMcpUrl,
  MCP_LOCAL_SETUP_STEPS,
  MCP_REMOTE_SETUP_STEPS,
} from "@/lib/mcp/config";

type McpSetupSectionProps = {
  apiUrl: string;
  keyPlaceholder?: string;
  variant?: "user" | "master";
};

export function McpSetupSection({
  apiUrl,
  keyPlaceholder = "YOUR_API_KEY_HERE",
  variant = "user",
}: McpSetupSectionProps) {
  const [mode, setMode] = useState<"local" | "remote">("local");

  const projectPath =
    typeof window !== "undefined"
      ? window.location.origin.includes("localhost")
        ? "C:/path/to/StrogeByAFR"
        : ""
      : "";

  const mcpConfig = useMemo(() => {
    const cwd =
      projectPath ||
      (typeof window !== "undefined" ? "C:/path/to/StrogeByAFR" : "/path/to/StrogeByAFR");

    return generateMcpServerConfig({
      projectPath: cwd,
      apiUrl,
      apiKeyPlaceholder: keyPlaceholder,
    });
  }, [apiUrl, keyPlaceholder, projectPath]);

  const remoteUrl = getRemoteMcpUrl(apiUrl);
  const remoteInstructions = useMemo(
    () =>
      generateRemoteMcpInstructions({
        apiUrl,
        keyPlaceholder: keyPlaceholder,
      }),
    [apiUrl, keyPlaceholder]
  );

  return (
    <div className="space-y-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-violet-400" />
          <p className="text-sm font-semibold text-violet-300">MCP — connect AI agents</p>
        </div>
        <div className="flex rounded-lg border border-border/60 bg-background/40 p-0.5 text-[10px]">
          <button
            type="button"
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              mode === "local" ? "bg-violet-500/20 text-violet-200" : "text-muted-foreground"
            )}
            onClick={() => setMode("local")}
          >
            Local (stdio)
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              mode === "remote" ? "bg-violet-500/20 text-violet-200" : "text-muted-foreground"
            )}
            onClick={() => setMode("remote")}
          >
            Remote (HTTP)
          </button>
        </div>
      </div>

      {mode === "local" ? (
        <>
          <p className="text-xs text-muted-foreground">
            {variant === "master"
              ? "Semua MCP client dengan stdio transport. Master key (skm_) unlock admin_* tools."
              : "Semua MCP client yang support stdio — paste config ke settings MCP client kamu."}
          </p>
          <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
            {MCP_LOCAL_SETUP_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <pre className="max-h-48 overflow-auto rounded-lg bg-black/30 p-3 text-[10px] leading-relaxed text-emerald-300/90">
            {mcpConfig}
          </pre>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => navigator.clipboard.writeText(mcpConfig)}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy local MCP config
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Globe className="h-3.5 w-3.5 shrink-0 mt-0.5 text-violet-400" />
            Streamable HTTP di /api/mcp — untuk semua MCP client yang support remote HTTP + Bearer API key.
          </p>
          <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
            {MCP_REMOTE_SETUP_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="rounded-lg bg-black/30 p-3 space-y-2">
            <p className="text-[10px] text-muted-foreground">Server URL</p>
            <p className="text-[11px] font-mono text-emerald-300/90 break-all">{remoteUrl}</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px]"
              onClick={() => navigator.clipboard.writeText(remoteUrl)}
            >
              <Copy className="mr-1 h-3 w-3" />
              Copy MCP URL
            </Button>
          </div>
          <pre className="max-h-40 overflow-auto rounded-lg bg-black/30 p-3 text-[10px] leading-relaxed text-emerald-300/90 whitespace-pre-wrap">
            {remoteInstructions}
          </pre>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => navigator.clipboard.writeText(remoteInstructions)}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy remote MCP setup
          </Button>
        </>
      )}

      <p className="text-[10px] text-muted-foreground">
        Tools: storage_verify, storage_list_files, storage_search, storage_list_folders, storage_get_file
        {variant === "master" ? ", admin_get_stats, admin_list_users, admin_get_settings" : ""}
      </p>
      <p className="text-[10px] text-amber-500/90">
        Jangan pernah paste API key di chat AI. Key cuma di MCP env / connector form.
      </p>
    </div>
  );
}
