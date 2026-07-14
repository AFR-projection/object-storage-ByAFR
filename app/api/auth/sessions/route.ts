import { NextRequest } from "next/server";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { requireAuth, destroySession, getClientIp } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/security";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { logActivity } from "@/lib/auth/audit";
import { publishToUser } from "@/lib/realtime/events";

function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  if (/Mobile|Android|iPhone/i.test(userAgent)) return "Mobile browser";
  if (/Macintosh|Mac OS/i.test(userAgent)) return "Mac browser";
  if (/Windows/i.test(userAgent)) return "Windows browser";
  if (/Linux/i.test(userAgent)) return "Linux browser";
  return "Browser";
}

export async function GET() {
  try {
    const user = await requireAuth();
    const rows = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastActiveAt));

    return apiSuccess({
      sessions: rows.map((s) => ({
        id: s.id,
        ip: s.ip,
        userAgent: s.userAgent,
        deviceLabel: s.deviceLabel || deviceLabel(s.userAgent),
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        expiresAt: s.expiresAt,
        isCurrent: s.id === user.sessionId,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE without id: revoke other sessions. ?all=1 revokes all including current. */
export async function DELETE(request: NextRequest) {
  try {
    if (!(await validateCsrf(request))) return apiError("Invalid CSRF token", 403);
    const user = await requireAuth();
    const all = request.nextUrl.searchParams.get("all") === "1";
    const ip = getClientIp(request);

    if (all) {
      await db.delete(sessions).where(eq(sessions.userId, user.id));
      await destroySession();
      await logActivity(user, "session_revoked", {
        ip,
        metadata: { reason: "revoke_all" },
      });
      publishToUser(user.id, {
      type: "session_revoked",
      reason: "revoke_all",
      wasCurrent: true,
    }).catch(() => {});
      return apiSuccess({ revoked: "all" });
    }

    await db
      .delete(sessions)
      .where(and(eq(sessions.userId, user.id), ne(sessions.id, user.sessionId)));

    await logActivity(user, "session_revoked", {
      ip,
      metadata: { reason: "revoke_others" },
    });
    publishToUser(user.id, {
      type: "session_revoked",
      reason: "revoke_others",
      wasCurrent: false,
    }).catch(() => {});

    return apiSuccess({ revoked: "others" });
  } catch (error) {
    return handleApiError(error);
  }
}
