import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { nanoid } from "nanoid";

export const OAUTH_ACCESS_PREFIX = "oat_";
export const OAUTH_REFRESH_PREFIX = "ort_";
export const OAUTH_CODE_PREFIX = "oac_";

export const OAUTH_SCOPES = ["read", "upload", "download", "delete", "write", "full"] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export const ACCESS_TOKEN_TTL_SEC = 3600;
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 3600;
export const AUTH_CODE_TTL_SEC = 600;

/** ChatGPT MCP connector + common OAuth clients */
export const ALLOWED_REDIRECT_HOSTS = [
  "chatgpt.com",
  "www.chatgpt.com",
  "chat.openai.com",
  "localhost",
  "127.0.0.1",
];

export function oauthBaseUrl(fallbackOrigin?: string): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_PUBLIC_URL ?? "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (fallbackOrigin) return fallbackOrigin.replace(/\/$/, "");
  return "http://localhost:3000";
}

export function mcpResourceUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/mcp`;
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function verifySecret(value: string, storedHash: string): boolean {
  const a = Buffer.from(hashSecret(value));
  const b = Buffer.from(storedHash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function generateClientId(): string {
  return crypto.randomUUID();
}

export function generateClientSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function generateOpaqueToken(prefix: string): string {
  return `${prefix}${nanoid(48)}`;
}

export function parseScopes(scope?: string | null): OAuthScope[] {
  if (!scope?.trim()) return ["read"];
  const parts = scope.split(/\s+/).filter(Boolean);
  const valid = parts.filter((s): s is OAuthScope => (OAUTH_SCOPES as readonly string[]).includes(s));
  return valid.length ? valid : ["read"];
}

export function scopesToString(scopes: OAuthScope[]): string {
  return [...new Set(scopes)].join(" ");
}

export function isAllowedRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
      return false;
    }
    return ALLOWED_REDIRECT_HOSTS.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

export function verifyPkce(
  codeVerifier: string,
  codeChallenge: string,
  method: string
): boolean {
  if (method !== "S256") return false;
  const digest = createHash("sha256").update(codeVerifier).digest("base64url");
  return digest === codeChallenge;
}
