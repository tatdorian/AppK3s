-- 0007_github.sql — GitHub repository deployment source
-- Adds 'github' to the app_type enum and five new columns to the applications table.
-- NOTE: ALTER TYPE ... ADD VALUE cannot run in the same transaction as other DDL on
--       PostgreSQL < 12. We wrap it in a DO block matching the pattern in 0000_initial.sql.

DO $$ BEGIN
  ALTER TYPE "app_type" ADD VALUE IF NOT EXISTS 'github';
EXCEPTION WHEN others THEN NULL; END $$;

ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "github_url"          text,
  ADD COLUMN IF NOT EXISTS "github_token"        text,
  ADD COLUMN IF NOT EXISTS "github_username"     varchar(255),
  ADD COLUMN IF NOT EXISTS "github_branch"       varchar(255) DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS "github_compose_path" varchar(500) DEFAULT 'docker-compose.yml';
