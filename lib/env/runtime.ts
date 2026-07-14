/**
 * Runtime environment helpers — cookie security follows actual public URL (HTTPS),
 * not blindly NODE_ENV=production (avoids broken login on HTTP deploys).
 */
export function appPublicUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
}

export function isHttpsPublicUrl(): boolean {
  return appPublicUrl().startsWith("https://");
}

/** Whether session/CSRF cookies should set the Secure flag. */
export function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  return isHttpsPublicUrl();
}

/** Apply HSTS only when the app is served over HTTPS. */
export function hstsEnabled(): boolean {
  if (process.env.HSTS_ENABLED === "false") return false;
  if (process.env.HSTS_ENABLED === "true") return true;
  return isHttpsPublicUrl();
}
