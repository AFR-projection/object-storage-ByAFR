-- ─────────────────────────────────────────────────────────────────────────────
-- Smart mail router: per-sender usage + health tracking so delivery can rotate
-- across Gmail senders, respect daily send limits, and rest failing senders.
-- Additive + idempotent.
--
-- Run:  npm run db:push   (or apply this file manually)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "mail_senders" ADD COLUMN IF NOT EXISTS "daily_limit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_senders" ADD COLUMN IF NOT EXISTS "daily_sent_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_senders" ADD COLUMN IF NOT EXISTS "sent_count_reset_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mail_senders" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mail_senders" ADD COLUMN IF NOT EXISTS "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_senders" ADD COLUMN IF NOT EXISTS "cooldown_until" timestamp with time zone;
