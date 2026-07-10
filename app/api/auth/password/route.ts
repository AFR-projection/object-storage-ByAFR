import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { requireAuth, destroyAllUserSessions } from "@/lib/auth/session";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { logActivity } from "@/lib/auth/audit";

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth();

    const body = await request.json();
    const { currentPassword, newPassword } = passwordSchema.parse(body);

    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!dbUser) {
      return apiError("User not found", 404);
    }

    const valid = await verifyPassword(currentPassword, dbUser.passwordHash);
    if (!valid) {
      return apiError("Current password is incorrect", 401);
    }

    const same = await verifyPassword(newPassword, dbUser.passwordHash);
    if (same) {
      return apiError("New password must be different from current password", 400);
    }

    const passwordHash = await hashPassword(newPassword);

    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await destroyAllUserSessions(user.id);

    await logActivity(user, "edit", {
      metadata: { field: "password", changedBy: "user" },
    });

    return apiSuccess({ message: "Password changed successfully. Please log in again." });
  } catch (error) {
    return handleApiError(error);
  }
}