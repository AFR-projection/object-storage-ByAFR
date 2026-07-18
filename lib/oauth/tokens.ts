import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { oauthAccessTokens, users } from "@/lib/db/schema";
import {
  ACCESS_TOKEN_TTL_SEC,
  generateOpaqueToken,
  hashSecret,
  OAUTH_ACCESS_PREFIX,
  OAUTH_REFRESH_PREFIX,
  REFRESH_TOKEN_TTL_SEC,
  verifySecret,
  parseScopes,
  type OAuthScope,
} from "@/lib/oauth/constants";
import { keyHasScope } from "@/lib/auth/api-key";
import type { SessionUserFromApiKey } from "@/lib/auth/api-key";

export type OAuthTokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

export async function issueTokens(input: {
  clientId: string;
  userId: string;
  scope: string;
}): Promise<OAuthTokenResponse> {
  const accessToken = generateOpaqueToken(OAUTH_ACCESS_PREFIX);
  const refreshToken = generateOpaqueToken(OAUTH_REFRESH_PREFIX);
  const now = Date.now();
  const expiresAt = new Date(now + ACCESS_TOKEN_TTL_SEC * 1000);
  const refreshExpiresAt = new Date(now + REFRESH_TOKEN_TTL_SEC * 1000);

  await db.insert(oauthAccessTokens).values({
    tokenHash: hashSecret(accessToken),
    refreshTokenHash: hashSecret(refreshToken),
    clientId: input.clientId,
    userId: input.userId,
    scope: input.scope,
    expiresAt,
    refreshExpiresAt,
  });

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SEC,
    refresh_token: refreshToken,
    scope: input.scope,
  };
}

export async function refreshAccessToken(input: {
  refreshToken: string;
  clientId: string;
}): Promise<OAuthTokenResponse | null> {
  const refreshHash = hashSecret(input.refreshToken);
  const [row] = await db
    .select()
    .from(oauthAccessTokens)
    .where(
      and(
        eq(oauthAccessTokens.refreshTokenHash, refreshHash),
        eq(oauthAccessTokens.clientId, input.clientId),
        isNull(oauthAccessTokens.revokedAt),
        gt(oauthAccessTokens.refreshExpiresAt, new Date())
      )
    )
    .limit(1);

  if (!row) return null;

  await db
    .update(oauthAccessTokens)
    .set({ revokedAt: new Date() })
    .where(eq(oauthAccessTokens.id, row.id));

  return issueTokens({
    clientId: row.clientId,
    userId: row.userId,
    scope: row.scope,
  });
}

export async function authenticateOAuthAccessToken(
  rawToken: string,
  requiredScopes: string[] = []
): Promise<SessionUserFromApiKey | null> {
  if (!rawToken.startsWith(OAUTH_ACCESS_PREFIX)) return null;

  const tokenHash = hashSecret(rawToken);
  const [row] = await db
    .select()
    .from(oauthAccessTokens)
    .where(
      and(
        eq(oauthAccessTokens.tokenHash, tokenHash),
        isNull(oauthAccessTokens.revokedAt),
        gt(oauthAccessTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!row) return null;

  const scopes = parseScopes(row.scope) as string[];
  for (const required of requiredScopes) {
    if (!keyHasScope(scopes, required)) return null;
  }

  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user || user.status === "suspended") return null;

  const tier = user.role === "master" ? "master" : "standard";

  return {
    ...user,
    effectiveUserId: user.id,
    isImpersonating: false,
    sessionId: `oauth:${row.id}`,
    authMethod: "api_key",
    apiKeyId: `oauth:${row.clientId}`,
    apiKeyScopes: scopes,
    apiKeyTier: tier,
  };
}

export function oauthScopesInclude(scopeString: string, required: OAuthScope): boolean {
  return keyHasScope(parseScopes(scopeString), required);
}
