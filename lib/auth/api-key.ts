import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { apiKeys, users, type User } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { AuthError, getSessionUser, type SessionUser } from "@/lib/auth/session";

export type ApiKeyScope = "read" | "upload" | "delete";
export const API_KEY_SCOPES: ApiKeyScope[] = ["read", "upload", "delete"];

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

export async function createApiKey(
  userId: string,
  name: string,
  scopes: ApiKeyScope[],
  expiresAt?: Date | null
): Promise<{ id: string; name: string; keyPrefix: string; scopes: string[]; rawKey: string; expiresAt: Date | null; createdAt: Date }> {
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
  const [keyRow] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyPrefix, prefix))
    .limit(1);

  if (!keyRow) {
    throw new AuthError("Unauthorized");
  }

  if (keyRow.expiresAt && keyRow.expiresAt.getTime() < Date.now()) {
    throw new AuthError("API key expired", 401);
  }

  const valid = await verifyPassword(rawKey, keyRow.keyHash);
  if (!valid) {
    throw new AuthError("Unauthorized");
  }

  for (const scope of requiredScopes) {
    if (!keyRow.scopes.includes(scope)) {
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
