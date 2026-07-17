-- Full-text search for files: content_text column + generated tsvector + GIN index.
-- Idempotent (safe to re-run). Does NOT touch wa_pairings — see note in your task.

ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "content_text" text;--> statement-breakpoint

-- Generated STORED tsvector: name (weight A) + content_text (weight B).
-- Computed by Postgres on every write, so it can never go stale.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'files' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE "files" ADD COLUMN "search_vector" tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
        setweight(to_tsvector('simple', coalesce("content_text", '')), 'B')
      ) STORED;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "files_search_vector_idx" ON "files" USING gin ("search_vector");
