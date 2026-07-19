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
  primary?: boolean;
  avoidForMcp?: boolean;
  badge?: "recommended" | "oauth" | "api-key" | "reference";
};

export function buildConnectionEndpoints(baseUrl: string): ConnectionEndpoint[] {
  void baseUrl;
  return [
    {
      id: "mcp-remote",
      label: "MCP Server (Remote)",
      path: "/api/mcp",
      auth: "OAuth 2.1 — browser login",
      useFor: "MCP connector / plugin form — any client with MCP + OAuth support",
      primary: true,
      badge: "recommended",
    },
    {
      id: "oauth-discovery",
      label: "OAuth Discovery",
      path: "/.well-known/oauth-authorization-server",
      auth: "Public metadata",
      useFor: "Auto-detected by MCP clients — do not paste manually into connector form",
      badge: "oauth",
    },
    {
      id: "api-rest",
      label: "REST API",
      path: "/api/v1/me",
      auth: "Bearer sk_* / skm_*",
      useFor: "Scripts, bots, HTTP automation — not for MCP connector URL field",
      badge: "api-key",
    },
    {
      id: "openapi",
      label: "OpenAPI Spec",
      path: "/api/v1/openapi",
      auth: "Bearer sk_* / skm_*",
      useFor: "Custom GPT Actions, Postman, Swagger — not MCP connector URL",
      avoidForMcp: true,
      badge: "api-key",
    },
    {
      id: "connect-manifest",
      label: "Connect Manifest",
      path: "/api/v1/connect",
      auth: "Bearer sk_* / skm_*",
      useFor: "Machine-readable discovery after auth — not MCP connector URL",
      avoidForMcp: true,
      badge: "reference",
    },
  ];
}

export function primaryMcpUrl(baseUrl: string): string {
  return getRemoteMcpUrl(baseUrl);
}

export const WRONG_MCP_URLS = [
  { path: "/api/v1/connect", reason: "Discovery manifest — not an MCP server" },
  { path: "/api/v1/openapi", reason: "OpenAPI spec — for Actions/plugins, not MCP" },
  { path: "/api/v1/me", reason: "Health check endpoint — not MCP" },
] as const;
