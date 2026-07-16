import { NextRequest } from "next/server";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { validateCsrf, checkRateLimit } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { getAdminSettings, defaultQuotaBytes } from "@/lib/admin-settings";
import { validatePasswordStrength } from "@/lib/security/password-policy";
import { sendCustomMessage } from "@/lib/whatsapp/whatsapp-service";
import { getClientIp } from "@/lib/auth/session";

const registerSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  phoneNumber: z.string().min(10).max(15),
  password: z.string().min(10).max(128),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);

    const settings = await getAdminSettings();
    if (!settings.registrationEnabled) {
      return apiError("Registration is disabled", 403);
    }

    const ip = getClientIp(request);
    const limit = await checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000);
    if (!limit.allowed) {
      return apiError("Too many registration attempts", 429);
    }

    const body = registerSchema.parse(await request.json());
    const cleanPhone = body.phoneNumber.replace(/\D/g, "");

    const passwordCheck = validatePasswordStrength(body.password);
    if (!passwordCheck.valid) {
      return apiError(`Password too weak: ${passwordCheck.errors.join(", ")}`, 400);
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.username, body.username), eq(users.email, cleanPhone)))
      .limit(1);

    if (existing) {
      return apiError("Username atau nomor WhatsApp sudah terdaftar", 409);
    }

    const passwordHash = await hashPassword(body.password);
    const quotaBytes = defaultQuotaBytes(settings);

    const [user] = await db
      .insert(users)
      .values({
        username: body.username,
        email: cleanPhone,
        passwordHash,
        role: "user",
        quotaBytes,
        status: "suspended",
      })
      .returning();

    const msg = `Notifikasi dari Storage ByAFR.\n\nUntuk menerima kode OTP, silakan balas pesan ini dengan kata:\n\nSAVE`;
    const sent = await sendCustomMessage(cleanPhone, msg);

    if (!sent) {
      await db.delete(users).where(eq(users.id, user.id));
      return apiError("Gagal mengirim pesan WhatsApp", 500);
    }

    return apiSuccess({
      userId: user.id,
      phoneNumber: cleanPhone,
      message: "Cek WhatsApp Anda untuk instruksi berikutnya",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
