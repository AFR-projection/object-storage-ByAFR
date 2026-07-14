type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const ipStore = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of ipStore) {
    if (entry.resetAt <= now) ipStore.delete(key);
  }
}, CLEANUP_INTERVAL);

export function checkIpRateLimit(
  ip: string,
  maxAttempts: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const key = `ip:${ip}`;
  const existing = ipStore.get(key);

  if (!existing || existing.resetAt <= now) {
    ipStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1 };
  }

  existing.count += 1;
  if (existing.count > maxAttempts) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: maxAttempts - existing.count };
}

export function resetIpRateLimit(ip: string): void {
  ipStore.delete(`ip:${ip}`);
}
