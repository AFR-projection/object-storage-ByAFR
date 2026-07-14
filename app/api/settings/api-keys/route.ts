import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, getClientIp } from "@/lib/auth/session";
import { getEffectiveUserId } from "@/lib/auth/permissions";
import { validateCsrf } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import {
  API_KEY_SCOPES,
  createApiKey,
  deleteApiKey,
  listApiKeys,
  type ApiKeyScope,
} from "@/lib/auth/api-key";

export async function GET() {
  try {
    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const keys = await listApiKeys(userId);
    return apiSuccess({ keys });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z
    .array(z.enum(["read", "upload", "delete"]))
    .min(1)
    .default(["read"]),
  expiresInDays: z.number().int().positive().max(3650).optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const body = createSchema.parse(await request.json());

    const scopes = body.scopes.filter((s): s is ApiKeyScope =>
      (API_KEY_SCOPES as string[]).includes(s)
    );
    if (scopes.length === 0) return apiError("At least one scope required", 400);

    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 86400000)
      : null;

    const key = await createApiKey(userId, body.name, scopes, expiresAt);
    void getClientIp(request);

    return apiSuccess({
      key: {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        scopes: key.scopes,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
        rawKey: key.rawKey,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const { id } = deleteSchema.parse(await request.json());

    const ok = await deleteApiKey(userId, id);
    if (!ok) return apiError("API key not found", 404);

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
