-- 0004_rbac.sql — Replace boolean app permissions with a role-based system

-- 1. Add role column (default 'viewer' for safety)
ALTER TABLE "app_permissions"
  ADD COLUMN IF NOT EXISTS "role" varchar(20) NOT NULL DEFAULT 'viewer';

-- 2. Backfill role from existing boolean permissions
UPDATE "app_permissions" SET "role" = 'owner'  WHERE "can_delete" = true;
UPDATE "app_permissions" SET "role" = 'editor' WHERE "can_delete" = false AND "can_edit" = true;
-- All remaining records (view-only) stay 'viewer'

-- 3. Drop old boolean columns
ALTER TABLE "app_permissions"
  DROP COLUMN IF EXISTS "can_view",
  DROP COLUMN IF EXISTS "can_deploy",
  DROP COLUMN IF EXISTS "can_edit",
  DROP COLUMN IF EXISTS "can_delete";
