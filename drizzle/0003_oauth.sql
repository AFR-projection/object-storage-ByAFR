CREATE TABLE IF NOT EXISTS "oauth_clients" (
  "client_id" text PRIMARY KEY NOT NULL,
  "client_secret_hash" text,
  "client_name" text,
  "redirect_uris" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "grant_types" jsonb DEFAULT '["authorization_code","refresh_token"]'::jsonb NOT NULL,
  "response_types" jsonb DEFAULT '["code"]'::jsonb NOT NULL,
  "token_endpoint_auth_method" text DEFAULT 'none' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "oauth_authorization_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code_hash" text NOT NULL,
  "client_id" text NOT NULL,
  "user_id" uuid NOT NULL,
  "redirect_uri" text NOT NULL,
  "scope" text DEFAULT 'read' NOT NULL,
  "code_challenge" text NOT NULL,
  "code_challenge_method" text DEFAULT 'S256' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_authorization_codes_hash_unique" ON "oauth_authorization_codes" ("code_hash");
CREATE INDEX IF NOT EXISTS "oauth_authorization_codes_client_idx" ON "oauth_authorization_codes" ("client_id");
CREATE INDEX IF NOT EXISTS "oauth_authorization_codes_expires_idx" ON "oauth_authorization_codes" ("expires_at");

DO $$ BEGIN
  ALTER TABLE "oauth_authorization_codes"
    ADD CONSTRAINT "oauth_authorization_codes_client_id_oauth_clients_client_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "oauth_authorization_codes"
    ADD CONSTRAINT "oauth_authorization_codes_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "oauth_access_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" text NOT NULL,
  "refresh_token_hash" text,
  "client_id" text NOT NULL,
  "user_id" uuid NOT NULL,
  "scope" text DEFAULT 'read' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "refresh_expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_access_tokens_hash_unique" ON "oauth_access_tokens" ("token_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_access_tokens_refresh_hash_unique" ON "oauth_access_tokens" ("refresh_token_hash");
CREATE INDEX IF NOT EXISTS "oauth_access_tokens_user_idx" ON "oauth_access_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "oauth_access_tokens_client_idx" ON "oauth_access_tokens" ("client_id");

DO $$ BEGIN
  ALTER TABLE "oauth_access_tokens"
    ADD CONSTRAINT "oauth_access_tokens_client_id_oauth_clients_client_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "oauth_access_tokens"
    ADD CONSTRAINT "oauth_access_tokens_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
