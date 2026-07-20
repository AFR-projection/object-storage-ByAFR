-- ─────────────────────────────────────────────────────────────────────────────
-- Drop all WhatsApp objects. Run ONLY after email delivery is confirmed working
-- in production (senders configured, a test OTP received). This is destructive:
-- it removes WhatsApp senders and pairing state permanently.
--
-- Run:  apply this file manually once email is verified.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "wa_pairings";--> statement-breakpoint
DROP TABLE IF EXISTS "whatsapp_senders";--> statement-breakpoint

-- Drop the phone-based OTP index; email OTP is the only channel now.
DROP INDEX IF EXISTS "otp_tokens_phone_idx";--> statement-breakpoint
ALTER TABLE "otp_tokens" DROP COLUMN IF EXISTS "phone_number";--> statement-breakpoint

-- The WhatsApp status enum is no longer referenced by any table.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wa_status') THEN
    DROP TYPE "wa_status";
  END IF;
END $$;--> statement-breakpoint

-- Optional: drop users.phone once every active user has migrated to email.
-- Left commented so operators decide when legacy numbers are safe to remove.
-- DROP INDEX IF EXISTS "users_phone_unique";
-- ALTER TABLE "users" DROP COLUMN IF EXISTS "phone";
