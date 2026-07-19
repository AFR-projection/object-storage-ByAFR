import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { oauthAuthorizationCodes } from "@/lib/db/schema";
import {
  AUTH_CODE_TTL_SEC,
  generateOpaqueToken,
  hashSecret,
  OAUTH_CODE_PREFIX,
  verifyPkce,
  type AnyOAuthScope,
  scopesToString,
} from "@/lib/oauth/constants";

export async function createAuthorizationCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  scopes: AnyOAuthScope[];
  codeChallenge: string;
  codeChallengeMethod: string;
}): Promise<string> {
  const rawCode = generateOpaqueToken(OAUTH_CODE_PREFIX);
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SEC * 1000);

  await db.insert(oauthAuthorizationCodes).values({
    codeHash: hashSecret(rawCode),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    scope: scopesToString(input.scopes),
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    expiresAt,
  });

  return rawCode;
}

export async function consumeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const codeHash = hashSecret(input.code);
  const [row] = await db
    .select()
    .from(oauthAuthorizationCodes)
    .where(
      and(
        eq(oauthAuthorizationCodes.codeHash, codeHash),
        eq(oauthAuthorizationCodes.clientId, input.clientId),
        eq(oauthAuthorizationCodes.redirectUri, input.redirectUri),
        isNull(oauthAuthorizationCodes.usedAt),
        gt(oauthAuthorizationCodes.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!row) return null;

  if (!verifyPkce(input.codeVerifier, row.codeChallenge, row.codeChallengeMethod)) {
    return null;
  }

  await db
    .update(oauthAuthorizationCodes)
    .set({ usedAt: new Date() })
    .where(eq(oauthAuthorizationCodes.id, row.id));

  return row;
}

export async function findAuthorizationCodeByRaw(code: string) {
  const codeHash = hashSecret(code);
  const [row] = await db
    .select()
    .from(oauthAuthorizationCodes)
    .where(eq(oauthAuthorizationCodes.codeHash, codeHash))
    .limit(1);
  return row ?? null;
}
