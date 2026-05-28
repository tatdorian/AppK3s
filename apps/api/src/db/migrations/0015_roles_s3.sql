-- ── 0015_roles_s3 ────────────────────────────────────────────────────────────
-- 1. Migrate existing 'admin' users → 'super-admin'
-- 2. Create s3_storages table

-- Migrate old admins to super-admin (keep 'viewer' users unchanged)
UPDATE users SET role = 'super-admin' WHERE role = 'admin';

-- Create S3 storages table
CREATE TABLE IF NOT EXISTS s3_storages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  endpoint    TEXT NOT NULL,
  region      TEXT NOT NULL DEFAULT 'us-east-1',
  bucket      TEXT NOT NULL,
  access_key  TEXT NOT NULL,   -- AES-256-GCM encrypted
  secret_key  TEXT NOT NULL,   -- AES-256-GCM encrypted
  path_style  BOOLEAN NOT NULL DEFAULT FALSE,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
