import { NextRequest } from "next/server";
import { eq, desc, count, sum, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, files, activityLogs } from "@/lib/db/schema";
import { requireMasterOrApiKey } from "@/lib/auth/api-key";
import { getClientIp } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/auth/audit";
import { validateCsrf } from "@/lib/security";
import { validatePasswordStrength } from "@/lib/security/password-policy";
import { deleteR2Object } from "@/lib/storage/r2";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { cacheDelPattern } from "@/lib/cache/redis";
import { defaultQuotaBytes, getAdminSettings } from "@/lib/admin-settings";

export async function GET(request: NextRequest) {
  try {
    await requireMasterOrApiKey(request, "users");

    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
    return apiSuccess({ users: allUsers });
  } catch (error) {
    return handleApiError(error);
  }
}

const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email().max(254).optional(),
  password: z.string().min(8),
  role: z.enum(["user"]).default("user"),
  quotaBytes: z.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const master = await requireMasterOrApiKey(request, "users");
    const body = createUserSchema.parse(await request.json());
    const ip = getClientIp(request);
    const settings = await getAdminSettings();

    // PASSWORD STRENGTH VALIDATION
    const passwordCheck = validatePasswordStrength(body.password);
    if (!passwordCheck.valid) {
      return apiError(`Password too weak: ${passwordCheck.errors.join(", ")}`, 400);
    }

    const passwordHash = await hashPassword(body.password);
    const quotaBytes = body.quotaBytes ?? defaultQuotaBytes(settings);

    const [user] = await db
      .insert(users)
      .values({
        username: body.username,
        email: body.email ? body.email.toLowerCase() : null,
        passwordHash,
        role: body.role,
        quotaBytes,
      })
      .returning();

    await logActivity(master, "create_user", {
      resourceType: "user",
      resourceId: user.id,
      metadata: { username: user.username, passwordStrength: passwordCheck.score },
      ip,
    });

    return apiSuccess({ user: { ...user, passwordHash: undefined } });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(3).optional(),
  email: z.string().email().max(254).nullable().optional(),
  password: z.string().min(8).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  suspendReason: z.string().max(500).nullable().optional(),
  mustChangePassword: z.boolean().optional(),
  quotaBytes: z.number().int().positive().optional(),
  bandwidthQuotaBytes: z.number().int().min(0).optional(),
  role: z.enum(["user", "master"]).optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const master = await requireMasterOrApiKey(request, "users");
    const body = updateUserSchema.parse(await request.json());
    const ip = getClientIp(request);

    const [existing] = await db.select().from(users).where(eq(users.id, body.id)).limit(1);
    if (!existing) return apiError("User not found", 404);

    // Prevent suspending a master account
    if (body.status && body.status === "suspended" && existing.role === "master") {
      return apiError("Cannot suspend a master account", 403);
    }

    // Prevent demoting the last master
    if (body.role && body.role !== existing.role && existing.role === "master") {
      const [masterCount] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.role, "master"));
      if (masterCount.count <= 1) {
        return apiError("Cannot demote the last master account", 400);
      }
    }

    // PASSWORD STRENGTH VALIDATION on update
    if (body.password) {
      const passwordCheck = validatePasswordStrength(body.password);
      if (!passwordCheck.valid) {
        return apiError(`Password too weak: ${passwordCheck.errors.join(", ")}`, 400);
      }
    }

    const updates: Partial<typeof existing> = { updatedAt: new Date() };
    if (body.username) updates.username = body.username;
    if (body.email !== undefined) updates.email = body.email ? body.email.toLowerCase() : null;
    if (body.status) {
      updates.status = body.status;
      if (body.status === "active") {
        updates.suspendReason = null;
      } else if (body.status === "suspended") {
        updates.suspendReason = body.suspendReason ?? existing.suspendReason ?? "Suspended by administrator";
      }
    }
    if (body.suspendReason !== undefined && body.status !== "active") {
      updates.suspendReason = body.suspendReason;
    }
    if (body.mustChangePassword !== undefined) {
      updates.mustChangePassword = body.mustChangePassword;
    }
    if (body.quotaBytes) updates.quotaBytes = body.quotaBytes;
    if (body.bandwidthQuotaBytes !== undefined) updates.bandwidthQuotaBytes = body.bandwidthQuotaBytes;
    if (body.password) updates.passwordHash = await hashPassword(body.password);
    if (body.role) updates.role = body.role;

    await db.update(users).set(updates).where(eq(users.id, body.id));

    if (body.status === "suspended") {
      await logActivity(master, "suspend_user", {
        resourceType: "user",
        resourceId: body.id,
        metadata: { reason: updates.suspendReason },
        ip,
      });
    } else {
      await logActivity(master, "update_user", {
        resourceType: "user",
        resourceId: body.id,
        ip,
      });
    }

    return apiSuccess({ updated: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const master = await requireMasterOrApiKey(request, "users");
    const { id, deleteData } = z
      .object({ id: z.string().uuid(), deleteData: z.boolean().default(false) })
      .parse(await request.json());
    const ip = getClientIp(request);

    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing) return apiError("User not found", 404);
    if (existing.role === "master") return apiError("Cannot delete master account", 403);

    if (deleteData) {
      const userFiles = await db.select().from(files).where(eq(files.userId, id));
      for (const file of userFiles) {
        try {
          await deleteR2Object(file.r2Key);
          if (file.thumbnailKey) await deleteR2Object(file.thumbnailKey);
        } catch {
          // continue cleanup
        }
      }
    }

    await db.delete(users).where(eq(users.id, id));

    await logActivity(master, "delete_user", {
      resourceType: "user",
      resourceId: id,
      metadata: { deleteData },
      ip,
    });

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
