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

export function generateRemoteMcpInstructions(options: { apiUrl: string }): string {
  const mcpUrl = getRemoteMcpUrl(options.apiUrl);
  const base = options.apiUrl.replace(/\/$/, "");

  return [
    "Remote MCP Connector (OAuth 2.1)",
    "",
    `✅ MCP Server URL: ${mcpUrl}`,
    "",
    "❌ JANGAN pakai URL ini untuk MCP connector:",
    `   ${base}/api/v1/connect  (manifest — bukan MCP server)`,
    `   ${base}/api/v1/openapi  (OpenAPI spec — untuk Custom GPT Actions, bukan MCP)`,
    "",
    "Setup MCP connector (semua client yang support MCP + OAuth):",
    "1. Paste MCP Server URL di atas",
    "2. Client auto-fetch OAuth dari /.well-known/oauth-authorization-server",
    "3. Login browser ke akun Storage ByAFR → Allow access",
    "4. Test tool storage_verify",
    "",
    "OAuth discovery:",
    `${base}/.well-known/oauth-authorization-server`,
    `${base}/.well-known/oauth-protected-resource/api/mcp`,
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
  "Buka MCP connector di client kamu (Developer Mode / Connectors)",
  "Server URL: https://…/api/mcp — bukan /connect atau /openapi",
  "OAuth auto-detect — login browser ke akun Storage ByAFR",
  "Klik Allow access di halaman consent",
  "Test dengan tool storage_verify",
] as const;

/** @deprecated use MCP_LOCAL_SETUP_STEPS */
export const MCP_SETUP_STEPS = MCP_LOCAL_SETUP_STEPS;
