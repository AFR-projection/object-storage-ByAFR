import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendCustomMessage } from "./whatsapp-service";
import { loginAlert, passwordChanged, accountLocked } from "./templates";

/**
 * WhatsApp is this app's primary contact channel, so account/security events are
 * pushed to the user's registered number in users.phone. A value that isn't all
 * digits (e.g. a legacy real email) is skipped rather than misdelivered.
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
function phoneOf(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  // Only pure-digit values are numbers; anything with letters is not a phone.
  if (digits.length < 10 || /[a-zA-Z@]/.test(value)) return null;
  return digits;
}

type NotifyEvent =
  | {
      type: "login";
      at: Date;
      ip?: string | null;
      device?: string | null;
      location?: string | null;
    }
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
      .select({ phone: users.phone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const phone = phoneOf(user?.phone ?? null);
    if (!phone) return;

    let message: string;
    switch (event.type) {
      case "login":
        message = loginAlert({
          time: formatTime(event.at),
          ip: event.ip,
          device: event.device,
          location: event.location,
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
