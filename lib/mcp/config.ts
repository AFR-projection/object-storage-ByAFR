/**
 * Generate MCP config JSON for any stdio-compatible MCP client.
 */
export function generateMcpServerConfig(options: {
  projectPath: string;
  apiUrl: string;
  apiKeyPlaceholder?: string;
}): string {
  const normalizedPath = options.projectPath.replace(/\\/g, "/");
  const key = options.apiKeyPlaceholder ?? "YOUR_API_KEY_HERE";

  return JSON.stringify(
    {
      mcpServers: {
        "storage-by-afr": {
          command: "npm",
          args: ["run", "mcp"],
          cwd: normalizedPath,
          env: {
            STORAGE_API_URL: options.apiUrl.replace(/\/$/, ""),
            STORAGE_API_KEY: key,
          },
        },
      },
    },
    null,
    2
  );
}

export function getRemoteMcpUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/$/, "")}/api/mcp`;
}

export function generateRemoteMcpInstructions(options: {
  apiUrl: string;
  keyPlaceholder?: string;
}): string {
  const mcpUrl = getRemoteMcpUrl(options.apiUrl);
  const key = options.keyPlaceholder ?? "YOUR_API_KEY_HERE";

  return [
    "Remote MCP — Streamable HTTP",
    "",
    `Server URL: ${mcpUrl}`,
    "Transport: MCP Streamable HTTP",
    "Authentication: Bearer API Key",
    `Authorization: Bearer ${key}`,
    "",
    "Compatible with: any MCP client that supports remote HTTP + Bearer auth.",
    "",
    "Setup:",
    "1. Open your MCP client's connector / server settings",
    "2. Paste Server URL above",
    "3. Choose API Key / Bearer auth — paste your sk_ or skm_ key",
    "4. Test with storage_verify tool",
    "",
    "Security: never paste your real key in AI chat — only in the connector form.",
  ].join("\n");
}

/** @deprecated use generateRemoteMcpInstructions */
export const generateChatGptMcpInstructions = generateRemoteMcpInstructions;

export const MCP_LOCAL_SETUP_STEPS = [
  "Buat API key (sk_ user / skm_ master)",
  "Copy config MCP di bawah → paste ke MCP client kamu (settings MCP / mcpServers)",
  "Ganti placeholder key dengan key asli (jangan commit ke git)",
  "Restart MCP client — AI agent bisa pakai storage tools otomatis",
] as const;

export const MCP_REMOTE_SETUP_STEPS = [
  "Buat API key — simpan aman, jangan paste di chat AI",
  "Buka MCP client kamu → tambah remote MCP server / connector",
  "Server URL: https://…/api/mcp (copy di bawah)",
  "Auth: Bearer / API Key → paste sk_ atau skm_ kamu",
  "Test dengan tool storage_verify",
] as const;

/** @deprecated use MCP_LOCAL_SETUP_STEPS */
export const MCP_SETUP_STEPS = MCP_LOCAL_SETUP_STEPS;
