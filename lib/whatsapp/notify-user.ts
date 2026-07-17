import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendCustomMessage } from "./whatsapp-service";
import { loginAlert, passwordChanged, accountLocked } from "./templates";

/**
 * WhatsApp acts as this app's email replacement, so account/security events are
 * pushed to the user's registered number. WA-registered users store their phone
 * number in users.email; a value that isn't all-digits (a real email address)
 * is skipped rather than misdelivered.
 */

/** Format an instant as a readable WIB (Asia/Jakarta) timestamp. */
function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date) + " WIB";
}

/** Return the deliverable phone number for a user, or null if not WA-reachable. */
function phoneOf(emailOrPhone: string | null): string | null {
  if (!emailOrPhone) return null;
  const digits = emailOrPhone.replace(/\D/g, "");
  // A stored email address contains letters; only pure-digit values are numbers.
  if (digits.length < 10 || /[a-zA-Z@]/.test(emailOrPhone)) return null;
  return digits;
}

type NotifyEvent =
  | { type: "login"; at: Date; ip?: string | null; device?: string | null }
  | { type: "password_changed"; at: Date }
  | { type: "account_locked"; minutes: number };

/**
 * Send a security notification to a user over WhatsApp. Fire-and-forget: never
 * throws and never blocks the calling request — a WhatsApp outage must not break
 * login, password change, etc. Callers may `void notifyUser(...)`.
 */
export async function notifyUser(userId: string, event: NotifyEvent): Promise<void> {
  try {
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const phone = phoneOf(user?.email ?? null);
    if (!phone) return;

    let message: string;
    switch (event.type) {
      case "login":
        message = loginAlert({
          time: formatTime(event.at),
          ip: event.ip,
          device: event.device,
        });
        break;
      case "password_changed":
        message = passwordChanged(formatTime(event.at));
        break;
      case "account_locked":
        message = accountLocked(event.minutes);
        break;
    }

    await sendCustomMessage(phone, message);
  } catch (err) {
    console.error(`[WA] notifyUser failed (${userId}):`, err);
  }
}
