import { getRemoteMcpUrl } from "@/lib/mcp/config";

export type ConnectionEndpointId =
  | "mcp-remote"
  | "api-rest"
  | "openapi"
  | "connect-manifest"
  | "oauth-discovery";

export type ConnectionEndpoint = {
  id: ConnectionEndpointId;
  label: string;
  path: string;
  auth: string;
  useFor: string;
  /** Primary URL for MCP connector form */
  primary?: boolean;
  /** Show warning — do not use for MCP connector */
  avoidForMcp?: boolean;
  badge?: "recommended" | "oauth" | "api-key" | "reference";
};

export function buildConnectionEndpoints(baseUrl: string): ConnectionEndpoint[] {
  const base = baseUrl.replace(/\/$/, "");
  const rows: ConnectionEndpoint[] = [
    {
      id: "mcp-remote",
      label: "MCP Server (Remote)",
      path: "/api/mcp",
      auth: "OAuth 2.1 — login browser",
      useFor: "MCP connector / plugin form (ChatGPT, Claude web, semua client MCP + OAuth)",
      primary: true,
      badge: "recommended",
    },
    {
      id: "oauth-discovery",
      label: "OAuth Discovery",
      path: "/.well-known/oauth-authorization-server",
      auth: "Public metadata",
      useFor: "Auto-detect oleh MCP client — jangan paste manual ke form connector",
      badge: "oauth",
    },
    {
      id: "api-rest",
      label: "REST API",
      path: "/api/v1/me",
      auth: "Bearer sk_* / skm_*",
      useFor: "Script, bot, HTTP automation — bukan form MCP connector",
      badge: "api-key",
    },
    {
      id: "openapi",
      label: "OpenAPI Spec",
      path: "/api/v1/openapi",
      auth: "Bearer sk_* / skm_*",
      useFor: "Custom GPT Actions, Postman, Swagger — bukan URL MCP connector",
      avoidForMcp: true,
      badge: "api-key",
    },
    {
      id: "connect-manifest",
      label: "Connect Manifest",
      path: "/api/v1/connect",
      auth: "Bearer sk_* / skm_*",
      useFor: "Agent discovery setelah auth — bukan URL MCP connector",
      avoidForMcp: true,
      badge: "reference",
    },
  ];
  void base;
  return rows;
}

export type ConnectionEndpointRow = ReturnType<typeof buildConnectionEndpoints>[number];

export function primaryMcpUrl(baseUrl: string): string {
  return getRemoteMcpUrl(baseUrl);
}

export const WRONG_MCP_URLS = [
  { path: "/api/v1/connect", reason: "Manifest discovery — bukan MCP server" },
  { path: "/api/v1/openapi", reason: "OpenAPI spec — untuk Actions/plugins, bukan MCP" },
  { path: "/api/v1/me", reason: "Health check API — bukan MCP endpoint" },
] as const;
