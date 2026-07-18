import {
  authenticateApiKey,
  extractBearerToken,
  isBearerApiKeyRequest,
  type SessionUserFromApiKey,
} from "@/lib/auth/api-key";
import { AuthError } from "@/lib/auth/session";
import { appPublicUrl } from "@/lib/env/runtime";
import { peekRateLimit, checkRateLimit } from "@/lib/security";
import {
  createMcpSessionPair,
  getMcpSession,
} from "@/lib/mcp/http-sessions";

const MCP_RATE_MAX = 120;
const MCP_RATE_WINDOW_MS = 60_000;

function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

async function authenticateMcpRequest(request: Request): Promise<SessionUserFromApiKey> {
  if (!isBearerApiKeyRequest(request)) {
    throw new Response(JSON.stringify({ success: false, error: "Bearer API key required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = extractBearerToken(request);
  if (!token) {
    throw new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const prefix = token.startsWith("skm_") ? token.slice(0, 13) : token.slice(0, 12);
  const rlKey = `mcp:${prefix}`;
  const peek = await peekRateLimit(rlKey, MCP_RATE_MAX, MCP_RATE_WINDOW_MS);
  if (!peek.allowed) {
    throw new Response(JSON.stringify({ success: false, error: "Rate limit exceeded" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }
  void checkRateLimit(rlKey, MCP_RATE_MAX, MCP_RATE_WINDOW_MS);

  try {
    return await authenticateApiKey(token, ["read"]);
  } catch (e) {
    if (e instanceof AuthError) {
      throw new Response(JSON.stringify({ success: false, error: e.message }), {
        status: e.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw e;
  }
}

export async function handleMcpHttpRequest(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (!["GET", "POST", "DELETE"].includes(request.method)) {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  let user: SessionUserFromApiKey;
  try {
    user = await authenticateMcpRequest(request);
  } catch (response) {
    if (response instanceof Response) return response;
    throw response;
  }

  const token = extractBearerToken(request)!;
  const baseUrl = appPublicUrl() || new URL(request.url).origin;
  const sessionId = request.headers.get("mcp-session-id");

  let transport;
  if (sessionId) {
    const existing = getMcpSession(sessionId);
    if (!existing || existing.apiKeyId !== user.apiKeyId) {
      return new Response(JSON.stringify({ error: "Invalid or expired MCP session" }), {
        status: 404,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
    transport = existing.transport;
  } else if (request.method === "POST") {
    const pair = await createMcpSessionPair(baseUrl, token, user);
    transport = pair.transport;
  } else {
    return new Response(JSON.stringify({ error: "Mcp-Session-Id required" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const response = await transport.handleRequest(request, {
    authInfo: {
      token,
      clientId: user.apiKeyId,
      scopes: user.apiKeyScopes,
      extra: { userId: user.id, tier: user.apiKeyTier },
    },
  });

  const headers = new Headers(response.headers);
  const cors = corsHeaders(origin);
  for (const [k, v] of Object.entries(cors)) {
    headers.set(k, v);
  }

  return new Response(response.body, { status: response.status, headers });
}
