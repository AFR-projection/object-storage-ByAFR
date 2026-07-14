import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { fileVersions, users } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { getAccessibleFile } from "@/lib/auth/permissions";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await requireAuth();
    const { id } = await params;

    const accessible = await getAccessibleFile(sessionUser, id);
    if (!accessible) return apiError("File not found", 404);

    const versions = await db
      .select({
        id: fileVersions.id,
        version: fileVersions.version,
        sizeBytes: fileVersions.sizeBytes,
        checksumSha256: fileVersions.checksumSha256,
        createdAt: fileVersions.createdAt,
        createdBy: fileVersions.createdBy,
        createdByUsername: users.username,
      })
      .from(fileVersions)
      .leftJoin(users, eq(fileVersions.createdBy, users.id))
      .where(eq(fileVersions.fileId, id))
      .orderBy(desc(fileVersions.version));

    return apiSuccess({
      currentVersion: accessible.file.version,
      versions,
      canRestore: accessible.canEdit,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
