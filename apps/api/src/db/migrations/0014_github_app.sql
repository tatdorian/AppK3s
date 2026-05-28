-- GitHub App (singleton par instance AppK3s)
CREATE TABLE IF NOT EXISTS github_app (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          BIGINT NOT NULL,
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  client_id       TEXT NOT NULL,
  client_secret   TEXT NOT NULL,
  webhook_secret  TEXT NOT NULL,
  private_key     TEXT NOT NULL,
  html_url        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Installations de la GitHub App (une par compte GitHub / organisation)
CREATE TABLE IF NOT EXISTS github_installations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id      BIGINT NOT NULL UNIQUE,
  user_id              UUID REFERENCES users(id) ON DELETE SET NULL,
  account_login        TEXT NOT NULL,
  account_type         TEXT NOT NULL DEFAULT 'User',
  account_avatar_url   TEXT,
  repository_selection TEXT NOT NULL DEFAULT 'selected',
  suspended            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ajouter app_type github-app + installation reference sur applications
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS github_installation_id UUID REFERENCES github_installations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS github_repo_full_name  TEXT;

-- Mettre à jour l'enum app_type si besoin (PostgreSQL ne supporte pas ALTER TYPE … ADD VALUE dans une transaction)
ALTER TYPE app_type ADD VALUE IF NOT EXISTS 'github-app';
