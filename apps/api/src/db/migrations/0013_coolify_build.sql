-- ── Git Sources (OAuth connections) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS git_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,        -- 'github' | 'gitlab'
  name VARCHAR(255) NOT NULL,
  provider_id VARCHAR(255),             -- GitHub/GitLab numeric user ID
  username VARCHAR(255),
  avatar_url TEXT,
  access_token TEXT NOT NULL,           -- encrypted with AES-256
  refresh_token TEXT,                   -- GitLab only
  token_expires_at TIMESTAMP,
  scopes TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ── Build fields on applications ──────────────────────────────────────────────
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS build_type VARCHAR(50),             -- nixpacks | dockerfile | docker-compose | static
  ADD COLUMN IF NOT EXISTS git_source_id UUID REFERENCES git_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(255),
  ADD COLUMN IF NOT EXISTS auto_deploy BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS build_dir VARCHAR(500) DEFAULT '.',
  ADD COLUMN IF NOT EXISTS dockerfile_path VARCHAR(500) DEFAULT 'Dockerfile',
  ADD COLUMN IF NOT EXISTS install_command TEXT,
  ADD COLUMN IF NOT EXISTS build_command TEXT,
  ADD COLUMN IF NOT EXISTS start_command TEXT,
  ADD COLUMN IF NOT EXISTS last_commit_sha VARCHAR(40),
  ADD COLUMN IF NOT EXISTS last_commit_message TEXT,
  ADD COLUMN IF NOT EXISTS publish_dir VARCHAR(500);           -- for static builds

-- ── Deployment details (for rollback) ────────────────────────────────────────
ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS commit_sha VARCHAR(40),
  ADD COLUMN IF NOT EXISTS commit_message TEXT,
  ADD COLUMN IF NOT EXISTS image_tag VARCHAR(500);             -- e.g. appk3s/myapp:abc123def
