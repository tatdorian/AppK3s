-- ── 0016_github_oauth ────────────────────────────────────────────────────────
-- Add github_id column to users for GitHub App OAuth login
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS users_github_id_idx ON users(github_id) WHERE github_id IS NOT NULL;
