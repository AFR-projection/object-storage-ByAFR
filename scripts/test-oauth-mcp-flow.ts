/**
 * OAuth + MCP discovery smoke test.
 * Usage: npx tsx scripts/test-oauth-mcp-flow.ts [baseUrl]
 */
import "dotenv/config";
import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { users } from "../lib/db/schema";
import { createAuthorizationCode } from "../lib/oauth/codes";
import { registerOAuthClient } from "../lib/oauth/clients";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

function assert(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${name}`);
    return;
  }
  console.error(`  ✗ ${name}${detail ? `: ${detail}` : ""}`);
  process.exitCode = 1;
}

function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function main() {
  console.log(`\nOAuth + MCP smoke test → ${BASE}\n`);

  // ── Discovery endpoints (no auth) ──
  const authMeta = await fetch(`${BASE}/.well-known/oauth-authorization-server`);
  const authJson = await authMeta.json();
  assert(
    "GET /.well-known/oauth-authorization-server",
    authMeta.status === 200 && authJson.registration_endpoint?.includes("/api/oauth/register"),
    `${authMeta.status} ${JSON.stringify(authJson).slice(0, 120)}`
  );

  const protMeta = await fetch(`${BASE}/.well-known/oauth-protected-resource/api/mcp`);
  const protJson = await protMeta.json();
  assert(
    "GET /.well-known/oauth-protected-resource/api/mcp",
    protMeta.status === 200 && protJson.resource?.endsWith("/api/mcp"),
    `${protMeta.status}`
  );

  // Wrong URLs must NOT pretend to be OAuth MCP servers
  const wrongConnect = await fetch(`${BASE}/api/v1/connect`);
  assert("GET /api/v1/connect without auth → 401", wrongConnect.status === 401, `${wrongConnect.status}`);

  const mcpNoAuth = await fetch(`${BASE}/api/mcp`, { method: "POST" });
  assert(
    "POST /api/mcp without auth → 401 + WWW-Authenticate",
    mcpNoAuth.status === 401 && !!mcpNoAuth.headers.get("www-authenticate"),
    `${mcpNoAuth.status}`
  );

  // ── DCR ──
  const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect";
  const regRes = await fetch(`${BASE}/api/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "smoke-test",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  const regJson = await regRes.json();
  assert("POST /api/oauth/register (DCR)", regRes.status === 201 && regJson.client_id, JSON.stringify(regJson));

  const clientId = regJson.client_id as string;

  // ── Token exchange (direct code issue — simulates consent) ──
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.status, "active"))
    .limit(1);

  if (!user) {
    console.error("No active user — skipping token exchange");
    process.exit(1);
  }

  const { verifier, challenge } = pkcePair();
  const code = await createAuthorizationCode({
    clientId,
    userId: user.id,
    redirectUri,
    scopes: ["read"],
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });

  const tokenRes = await fetch(`${BASE}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  const tokenJson = await tokenRes.json();
  assert(
    "POST /api/oauth/token (PKCE)",
    tokenRes.status === 200 && tokenJson.access_token?.startsWith("oat_"),
    JSON.stringify(tokenJson)
  );

  const accessToken = tokenJson.access_token as string;

  const me = await fetch(`${BASE}/api/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meJson = await me.json();
  assert("GET /api/v1/me with OAuth token", me.status === 200 && meJson.success, meJson.error);

  // MCP initialize with OAuth token
  const initRes = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "1.0.0" },
      },
    }),
  });
  assert(
    "POST /api/mcp initialize with OAuth",
    initRes.status === 200 && !!initRes.headers.get("mcp-session-id"),
    `status=${initRes.status}`
  );

  console.log("\n" + (process.exitCode ? "FAILED" : "ALL OAUTH/MCP TESTS PASSED") + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
