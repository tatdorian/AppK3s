-- 0008_must_change_password.sql
-- Adds must_change_password flag to users.
-- The default seed account (admin@appk3s.local) is flagged to force a password
-- change on first login. All other accounts default to false.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "must_change_password" boolean NOT NULL DEFAULT false;

-- Flag the default seed account so it must change password on first login.
UPDATE "users" SET "must_change_password" = true WHERE email = 'admin@appk3s.local';
