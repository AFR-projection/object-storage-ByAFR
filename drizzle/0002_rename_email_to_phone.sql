-- Rename users.email -> users.phone (the column always held WhatsApp numbers,
-- never real emails). Idempotent + safe: renames in place, no data change.

DO $$
BEGIN
  -- Rename the column only if the old name still exists.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'phone'
  ) THEN
    ALTER TABLE "users" RENAME COLUMN "email" TO "phone";
  END IF;
END $$;--> statement-breakpoint

-- Rename the unique index to match (Postgres keeps the old index name on a
-- column rename, so do it explicitly). Guarded so re-runs are safe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'users_email_unique')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'users_phone_unique') THEN
    ALTER INDEX "users_email_unique" RENAME TO "users_phone_unique";
  END IF;
END $$;
