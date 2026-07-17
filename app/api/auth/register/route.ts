import { NextRequest } from "next/server";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession, getClientIp } from "@/lib/auth/session";
import { logActivity } from "@/lib/auth/audit";
import { validateCsrf, checkRateLimit } from "@/lib/security";
import { validatePasswordStrength } from "@/lib/security/password-policy";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { defaultQuotaBytes, getAdminSettings } from "@/lib/admin-settings";

const registerSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, "Invalid username"),
  phone: z.string().min(10).max(15).regex(/^\d+$/, "Phone must be digits only").optional(),
  password: z.string().min(10).max(128),
});

export async function GET() {
  try {
    const settings = await getAdminSettings();
    return apiSuccess({
      enabled: settings.registrationEnabled,
      maintenance: settings.maintenanceMode,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const settings = await getAdminSettings();
    if (settings.maintenanceMode) {
      return apiError(settings.maintenanceMessage || "Maintenance mode", 503, {
        code: "MAINTENANCE",
      });
    }
    if (!settings.registrationEnabled) {
      return apiError("Registration is currently disabled", 403, { code: "REGISTRATION_DISABLED" });
    }

    const ip = getClientIp(request);
    const limit = await checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000);
    if (!limit.allowed) {
      return apiError("Too many registration attempts. Try again later.", 429);
    }

    const body = registerSchema.parse(await request.json());
    const passwordCheck = validatePasswordStrength(body.password);
    if (!passwordCheck.valid) {
      return apiError(`Password too weak: ${passwordCheck.errors.join(", ")}`, 400);
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        body.phone
          ? or(eq(users.username, body.username), eq(users.phone, body.phone))
          : eq(users.username, body.username)
      )
      .limit(1);

    if (existing) {
      return apiError("Username or phone number already taken", 409);
    }

    const passwordHash = await hashPassword(body.password);
    const quotaBytes = defaultQuotaBytes(settings);

    const [user] = await db
      .insert(users)
      .values({
        username: body.username,
        phone: body.phone ?? null,
        passwordHash,
        role: "user",
        quotaBytes,
      })
      .returning();

    await createSession(user.id, ip, request.headers.get("user-agent") ?? undefined);

    await logActivity(user, "create_user", {
      ip,
      metadata: { selfRegister: true, username: user.username },
    });

    return apiSuccess({
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
