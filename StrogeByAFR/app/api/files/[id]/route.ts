import { NextRequest } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { files, fileContents, changeHistory } from "@/lib/db/schema";
import { requireAuth, getClientIp } from "@/lib/auth/session";
import { canAccessUserResource } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/auth/audit";
import { validateCsrf } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await requireAuth();
    const { id } = await params;

    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), isNull(files.deletedAt)))
      .limit(1);

    if (!file || !canAccessUserResource(sessionUser, file.userId)) {
      return apiError("File not found", 404);
    }

    const [content] = await db
      .select()
      .from(fileContents)
      .where(eq(fileContents.fileId, id))
      .limit(1);

    return apiSuccess({ file, content: content ?? null });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateSchema = z.object({
  content: z.record(z.string(), z.unknown()).optional(),
  annotations: z.record(z.string(), z.unknown()).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const sessionUser = await requireAuth();
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const ip = getClientIp(request);

    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), isNull(files.deletedAt)))
      .limit(1);

    if (!file || !canAccessUserResource(sessionUser, file.userId)) {
      return apiError("File not found", 404);
    }

    const [existing] = await db
      .select()
      .from(fileContents)
      .where(eq(fileContents.fileId, id))
      .limit(1);

    if (existing) {
      await db
        .update(fileContents)
        .set({
          contentJson: body.content ?? existing.contentJson,
          annotationsJson: body.annotations ?? existing.annotationsJson,
          updatedAt: new Date(),
        })
        .where(eq(fileContents.fileId, id));
    } else {
      await db.insert(fileContents).values({
        fileId: id,
        contentJson: body.content ?? null,
        annotationsJson: body.annotations ?? null,
      });
    }

    await db
      .update(files)
      .set({ version: file.version + 1, updatedAt: new Date() })
      .where(eq(files.id, id));

    await db.insert(changeHistory).values({
      fileId: id,
      userId: sessionUser.effectiveUserId,
      changeType: "edit",
      snapshot: body.content ?? body.annotations ?? {},
    });

    await logActivity(sessionUser, "edit", {
      resourceType: "file",
      resourceId: id,
      ip,
    });

    return apiSuccess({ saved: true });
  } catch (error) {
    return handleApiError(error);
  }
}
