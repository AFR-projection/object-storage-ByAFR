import { cookies } from "next/headers";
import { eq, and, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users, type User } from "@/lib/db/schema";
import { nanoid } from "nanoid";

const SESSION_COOKIE = "storage_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const ROTATION_INTERVAL_MS = 1000 * 60 * 60 * 24; // 24 hours
export type SessionUser = User & {
  effectiveUserId: string;
  isImpersonating: boolean;
  sessionId: string;
};

export async function createSession(
  userId: string,
  ip?: string,
  userAgent?: string,
  impersonatingUserId?: string
): Promise<string> {
  // Single active session: delete ALL existing sessions for this user
  await db.delete(sessions).where(eq(sessions.userId, userId));

  const sessionId = nanoid(32);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
    ip,
    userAgent,
    impersonatingUserId: impersonatingUserId ?? null,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });

  return sessionId;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    cookieStore.delete(SESSION_COOKIE);
  }
}

export async function destroyAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function rotateSession(
  currentSessionId: string,
  userId: string,
  ip?: string,
  userAgent?: string
): Promise<string> {
  const newSessionId = nanoid(32);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  // Delete old session
  await db.delete(sessions).where(eq(sessions.id, currentSessionId));

  // Create new session
  await db.insert(sessions).values({
    id: newSessionId,
    userId,
    expiresAt,
    ip,
    userAgent,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, newSessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });

  return newSessionId;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!session) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || user.status === "suspended") return null;

  const effectiveUserId = session.impersonatingUserId ?? user.id;

  // Check if session needs rotation (older than 24h)
  const sessionAge = Date.now() - new Date(session.createdAt).getTime();
  if (sessionAge > ROTATION_INTERVAL_MS) {
    // Rotate silently - don't block the request
    rotateSession(sessionId, user.id, session.ip ?? undefined, session.userAgent ?? undefined)
      .catch(() => {}); // Fire and forget
  }

  return {
    ...user,
    effectiveUserId,
    isImpersonating: !!session.impersonatingUserId,
    sessionId: session.id,
  };
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new AuthError("Unauthorized");
  }
  return user;
}

export async function requireMaster(): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role !== "master") {
    throw new AuthError("Forbidden", 403);
  }
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}
