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
  const [mode, setMode] = useState<"local" | "remote">("remote");

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
    () => generateRemoteMcpInstructions({ apiUrl }),
    [apiUrl]
  );

  return (
    <div className="space-y-3 rounded-xl border border-violet-500/25 bg-violet-500/[0.04] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-violet-400" />
          <p className="text-sm font-semibold text-violet-200">MCP configuration</p>
        </div>
        <div className="flex rounded-lg border border-border/50 bg-background/40 p-0.5 text-[10px]">
          <button
            type="button"
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              mode === "remote" ? "bg-violet-500/20 text-violet-200" : "text-muted-foreground"
            )}
            onClick={() => setMode("remote")}
          >
            Remote (OAuth)
          </button>
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
        </div>
      </div>

      {mode === "remote" ? (
        <>
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Globe className="h-3.5 w-3.5 shrink-0 mt-0.5 text-violet-400" />
            Streamable HTTP with OAuth 2.1 — required for MCP connector / plugin forms. No manual API key paste.
          </p>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
            <p className="text-[10px] font-medium text-emerald-300/90 mb-1">Correct MCP Server URL</p>
            <code className="text-[11px] font-mono break-all text-emerald-200/90">{remoteUrl}</code>
          </div>
          <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
            {MCP_REMOTE_SETUP_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => navigator.clipboard.writeText(remoteInstructions)}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy setup instructions
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {variant === "master"
              ? "For MCP clients with stdio transport. Master keys (skm_) unlock admin_* tools."
              : "For local MCP clients (Cursor, Claude Desktop, etc.) — paste config into mcpServers settings."}
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
      )}

      <div className="space-y-1 text-[10px] text-muted-foreground">
        <p>
          <span className="text-foreground/70">Read:</span> storage_verify, storage_list_files,
          storage_search, storage_list_folders, storage_get_file, storage_get_docs
        </p>
        <p>
          <span className="text-foreground/70">Write</span> (needs write/delete scope):
          storage_rename_file, storage_move_file, storage_favorite_file, storage_update_note,
          storage_restore_file, storage_delete_file
        </p>
        {variant === "master" && (
          <p>
            <span className="text-foreground/70">Admin</span> (master key): admin_get_stats,
            admin_list_users, admin_get_settings
          </p>
        )}
      </div>
      <p className="text-[10px] text-amber-500/90">
        Never paste API keys in AI chat. Keys belong in MCP env or secure connector settings only.
      </p>
    </div>
  );
}
