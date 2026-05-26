-- 0005_projects.sql — Système de projets (groupes d'applications + RBAC par projet)

-- 1. Table projects
CREATE TABLE IF NOT EXISTS "projects" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"        varchar(255) NOT NULL,
  "description" text,
  "created_at"  timestamp NOT NULL DEFAULT now(),
  "updated_at"  timestamp NOT NULL DEFAULT now()
);

-- 2. Table project_members (rôle par projet)
--    role: 'owner' | 'member' | 'viewer'
CREATE TABLE IF NOT EXISTS "project_members" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id"  uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id"     uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role"        varchar(20) NOT NULL DEFAULT 'viewer',
  "created_at"  timestamp NOT NULL DEFAULT now(),
  UNIQUE("project_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "idx_proj_members_project" ON "project_members" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_proj_members_user"    ON "project_members" ("user_id");

-- 3. Ajouter project_id aux applications (nullable pour rétrocompat)
ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL;

-- 4. Créer un projet "Default" et y rattacher toutes les apps existantes
INSERT INTO "projects" ("id", "name", "description")
VALUES ('00000000-0000-0000-0000-000000000001', 'Default', 'Projet par défaut')
ON CONFLICT DO NOTHING;

UPDATE "applications"
  SET "project_id" = '00000000-0000-0000-0000-000000000001'
  WHERE "project_id" IS NULL;
