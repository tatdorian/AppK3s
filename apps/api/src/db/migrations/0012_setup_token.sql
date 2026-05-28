ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "setup_token" varchar(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "setup_token_expires_at" timestamp;
