-- Settings table: simple key/value store for global configuration
CREATE TABLE IF NOT EXISTS "settings" (
  "key"         varchar(100) PRIMARY KEY,
  "value"       text NOT NULL DEFAULT '',
  "updated_at"  timestamp NOT NULL DEFAULT now()
);

-- Seed default settings
INSERT INTO "settings" ("key", "value") VALUES
  ('defaultDomain',       '')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "settings" ("key", "value") VALUES
  ('defaultIngressClass', 'traefik')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "settings" ("key", "value") VALUES
  ('defaultTls',          'false')
ON CONFLICT ("key") DO NOTHING;
