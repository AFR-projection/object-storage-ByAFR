import { NextRequest } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { getEffectiveUserId } from "@/lib/auth/permissions";
import { validateCsrf } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";

const schema = z.object({
  fileId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const userId = getEffectiveUserId(sessionUser);
    const { fileId } = schema.parse(await request.json());

    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.userId, userId)))
      .limit(1);

    if (!file) return apiError("File not found", 404);

    await db.delete(files).where(eq(files.id, fileId));
    return apiSuccess({ cancelled: true });
  } catch (error) {
    return handleApiError(error);
  }
}
