import { eq, and, desc, count } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { apiKeys, users, type User } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { AuthError, getSessionUser, type SessionUser } from "@/lib/auth/session";
import { checkRateLimit, peekRateLimit } from "@/lib/security";

export type ApiKeyScope = "read" | "upload" | "download" | "delete" | "write" | "full";

export const API_KEY_SCOPES: ApiKeyScope[] = [
  "read",
  "upload",
  "download",
  "delete",
  "write",
  "full",
];

export const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, { label: string; description: string }> = {
  read: {
    label: "Read",
    description: "List files, folders, search, and file metadata",
  },
  upload: {
    label: "Upload",
    description: "Upload files via presign → complete flow",
  },
  download: {
    label: "Download",
    description: "Download individual files and zip archives",
  },
  delete: {
    label: "Delete",
    description: "Soft delete and permanently remove files",
  },
  write: {
    label: "Write",
    description: "Rename, move, favorite, restore, and edit notes",
  },
  full: {
    label: "Full access",
    description: "All storage API permissions (excluding admin routes)",
  },
};

export const API_KEY_PRESETS = {
  ai_agent: {
    name: "AI Agent",
    description: "Best for AI assistants — read, upload, download, and edit notes",
    scopes: ["read", "upload", "download", "write"] as ApiKeyScope[],
    expiresInDays: 90,
  },
  read_only: {
    name: "Read only",
    description: "Browse and search files without making changes",
    scopes: ["read"] as ApiKeyScope[],
    expiresInDays: null as number | null,
  },
  upload_bot: {
    name: "Upload bot",
    description: "Automated uploads with file listing",
    scopes: ["read", "upload"] as ApiKeyScope[],
    expiresInDays: 365,
  },
  full_access: {
    name: "Full access",
    description: "Complete programmatic access (use with caution)",
    scopes: ["full"] as ApiKeyScope[],
    expiresInDays: 90,
  },
} as const;

export type ApiKeyPreset = keyof typeof API_KEY_PRESETS;

export const MAX_API_KEYS_PER_USER = 10;
const FAILED_AUTH_MAX = 20;
const FAILED_AUTH_WINDOW_MS = 15 * 60_000;

export type SessionUserFromApiKey = User & {
  effectiveUserId: string;
  isImpersonating: boolean;
  sessionId: string;
  authMethod: "api_key";
  apiKeyId: string;
  apiKeyScopes: string[];
};

function generateRawKey(): { raw: string; prefix: string } {
  const secret = nanoid(40);
  const raw = `sk_${secret}`;
  const prefix = raw.slice(0, 12);
  return { raw, prefix };
}

export function isBearerApiKeyRequest(request: Request): boolean {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7).trim().startsWith("sk_");
}

export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

export function keyHasScope(keyScopes: string[], required: ApiKeyScope): boolean {
  if (keyScopes.includes("full")) return true;
  return keyScopes.includes(required);
}

export function keyHasAnyScope(keyScopes: string[], required: ApiKeyScope[]): boolean {
  return required.some((scope) => keyHasScope(keyScopes, scope));
}

export function normalizeApiKeyScopes(scopes: string[]): ApiKeyScope[] {
  return scopes.filter((s): s is ApiKeyScope =>
    (API_KEY_SCOPES as string[]).includes(s)
  );
}

export async function countApiKeys(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId));
  return row?.total ?? 0;
}

export async function createApiKey(
  userId: string,
  name: string,
  scopes: ApiKeyScope[],
  expiresAt?: Date | null
): Promise<{ id: string; name: string; keyPrefix: string; scopes: string[]; rawKey: string; expiresAt: Date | null; createdAt: Date }> {
  const existing = await countApiKeys(userId);
  if (existing >= MAX_API_KEYS_PER_USER) {
    throw new AuthError(`Maximum ${MAX_API_KEYS_PER_USER} API keys allowed`, 400);
  }

  const { raw, prefix } = generateRawKey();
  const keyHash = await hashPassword(raw);

  const [row] = await db
    .insert(apiKeys)
    .values({
      userId,
      name,
      keyPrefix: prefix,
      keyHash,
      scopes,
      expiresAt: expiresAt ?? null,
    })
    .returning();

  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes: row.scopes,
    rawKey: raw,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export async function listApiKeys(userId: string) {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function deleteApiKey(userId: string, keyId: string): Promise<boolean> {
  const deleted = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
    .returning({ id: apiKeys.id });
  return deleted.length > 0;
}

export async function authenticateApiKey(
  rawKey: string,
  requiredScopes: ApiKeyScope[] = []
): Promise<SessionUserFromApiKey> {
  if (!rawKey.startsWith("sk_")) {
    throw new AuthError("Unauthorized");
  }

  const prefix = rawKey.slice(0, 12);
  const failKey = `apikey:fail:${prefix}`;
  const blocked = await peekRateLimit(failKey, FAILED_AUTH_MAX, FAILED_AUTH_WINDOW_MS);
  if (!blocked.allowed) {
    throw new AuthError("Too many failed authentication attempts", 429);
  }

  const [keyRow] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyPrefix, prefix))
    .limit(1);

  if (!keyRow) {
    void checkRateLimit(failKey, FAILED_AUTH_MAX, FAILED_AUTH_WINDOW_MS);
    throw new AuthError("Unauthorized");
  }

  if (keyRow.expiresAt && keyRow.expiresAt.getTime() < Date.now()) {
    throw new AuthError("API key expired", 401);
  }

  const valid = await verifyPassword(rawKey, keyRow.keyHash);
  if (!valid) {
    void checkRateLimit(failKey, FAILED_AUTH_MAX, FAILED_AUTH_WINDOW_MS);
    throw new AuthError("Unauthorized");
  }

  for (const scope of requiredScopes) {
    if (!keyHasScope(keyRow.scopes, scope)) {
      throw new AuthError(`Missing scope: ${scope}`, 403);
    }
  }

  const [user] = await db.select().from(users).where(eq(users.id, keyRow.userId)).limit(1);
  if (!user || user.status === "suspended") {
    throw new AuthError("Unauthorized");
  }

  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyRow.id));

  return {
    ...user,
    effectiveUserId: user.id,
    isImpersonating: false,
    sessionId: `api_key:${keyRow.id}`,
    authMethod: "api_key",
    apiKeyId: keyRow.id,
    apiKeyScopes: keyRow.scopes,
  };
}

/**
 * Session cookie auth OR Bearer `sk_*` API key.
 * SessionUserFromApiKey is structurally compatible with SessionUser.
 */
export async function requireAuthOrApiKey(
  request: Request,
  requiredScopes: ApiKeyScope[] = []
): Promise<SessionUser> {
  if (isBearerApiKeyRequest(request)) {
    const token = extractBearerToken(request);
    if (!token) throw new AuthError("Unauthorized");
    return authenticateApiKey(token, requiredScopes);
  }

  const user = await getSessionUser();
  if (!user) throw new AuthError("Unauthorized");
  return user;
}
