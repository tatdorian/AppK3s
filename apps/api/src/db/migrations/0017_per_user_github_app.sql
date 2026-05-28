-- ── 0017_per_user_github_app ──────────────────────────────────────────────────
-- GitHub App becomes per-user: each AK3s user can create their own GitHub App.
ALTER TABLE github_app ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Assign existing row(s) to the first super-admin
UPDATE github_app
SET user_id = (SELECT id FROM users WHERE role = 'super-admin' ORDER BY created_at LIMIT 1)
WHERE user_id IS NULL;
