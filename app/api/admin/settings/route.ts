import { NextRequest } from "next/server";
import { count } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireMaster } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import {
  getAdminSettings,
  updateAdminSettings,
  type AdminSettings,
} from "@/lib/admin-settings";

export type { AdminSettings };

const patchSchema = z
  .object({
    maintenanceMode: z.boolean().optional(),
    maintenanceMessage: z.string().max(500).optional(),
    defaultQuotaGB: z.number().optional(),
    maxUploadSizeMB: z.number().optional(),
    allowedMimeTypes: z.array(z.string()).optional(),
    blockedExtensions: z.array(z.string()).optional(),
    sessionDurationHours: z.number().optional(),
    maxSessionsPerUser: z.number().optional(),
    registrationEnabled: z.boolean().optional(),
    maxFileLifetimeDays: z.number().optional(),
    storageWarningThreshold: z.number().optional(),
    autoDeleteTrashDays: z.number().optional(),
    rateLimitPerMinute: z.number().optional(),
    logRetentionDays: z.number().optional(),
  })
  .strip();

export async function GET() {
  try {
    await requireMaster();
    const settings = await getAdminSettings(true);
    const [userCount] = await db.select({ count: count() }).from(users);

    return apiSuccess({
      ...settings,
      _meta: {
        totalUsers: userCount.count,
        version: "1.0.0",
        persistence: "database",
        cacheTtlSeconds: 30,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);
    await requireMaster();

    const body = patchSchema.parse(await request.json());
    const updated = await updateAdminSettings(body);

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
