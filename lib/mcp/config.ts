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
    `MCP Server URL: ${mcpUrl}`,
    "",
    "Do NOT use these URLs in the MCP connector form:",
    `  ${base}/api/v1/connect  (discovery manifest)`,
    `  ${base}/api/v1/openapi  (OpenAPI spec for Actions, not MCP)`,
    "",
    "Setup:",
    "1. Paste the MCP Server URL above",
    "2. Client auto-discovers OAuth via /.well-known/oauth-authorization-server",
    "3. Sign in with your Storage ByAFR account and click Allow access",
    "4. Test with the storage_verify tool",
  ].join("\n");
}

export const MCP_LOCAL_SETUP_STEPS = [
  "Create an API key (sk_ for users, skm_ for master)",
  "Copy the MCP config below into your MCP client settings",
  "Replace the key placeholder with your real key (never commit to git)",
  "Restart the MCP client — storage tools become available automatically",
] as const;

export const MCP_REMOTE_SETUP_STEPS = [
  "Open your MCP client connector settings (Developer Mode / Connectors)",
  "Server URL: https://your-domain/api/mcp — not /connect or /openapi",
  "OAuth is detected automatically — sign in via browser",
  "Click Allow access on the consent screen",
  "Verify with the storage_verify tool",
] as const;

/** @deprecated use MCP_LOCAL_SETUP_STEPS */
export const MCP_SETUP_STEPS = MCP_LOCAL_SETUP_STEPS;
