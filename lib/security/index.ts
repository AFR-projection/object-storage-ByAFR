import { redisIncr } from "@/lib/cache/redis";
import { checkIpRateLimit as memCheckIp, resetIpRateLimit as memResetIp } from "./rate-limiter";

export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number }> {
  const count = await redisIncr(`ratelimit:${key}:${Math.floor(Date.now() / windowMs)}`, windowMs);

  if (count === null) {
    // Redis unavailable — use in-memory fallback
    const ip = key.replace(/^login:/, "");
    return memCheckIp(ip, maxAttempts, windowMs);
  }

  return {
    allowed: count <= maxAttempts,
    remaining: Math.max(0, maxAttempts - count),
  };
}

export function checkIpRateLimit(
  ip: string,
  maxAttempts: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  return memCheckIp(ip, maxAttempts, windowMs);
}

export function resetIpRateLimit(ip: string): void {
  memResetIp(ip);
}

import type { NextRequest } from "next/server";

export async function validateCsrf(request: NextRequest): Promise<boolean> {
  // Skip CSRF for Bearer API keys (sk_*) — they are not browser cookie sessions.
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token.startsWith("sk_")) return true;
  }

  const headerToken = request.headers.get("x-csrf-token");
  const cookieToken = request.cookies.get("csrf_token")?.value;

  if (!headerToken || !cookieToken) return false;
  return headerToken === cookieToken;
}

export function generateCsrfToken(): string {
  return crypto.randomUUID();
}

export const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
