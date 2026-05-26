-- App-level access control
CREATE TABLE IF NOT EXISTS "app_permissions" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "app_id"     uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "can_view"   boolean NOT NULL DEFAULT true,
  "can_deploy" boolean NOT NULL DEFAULT false,
  "can_edit"   boolean NOT NULL DEFAULT false,
  "can_delete" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  UNIQUE("app_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "idx_app_perms_app"  ON "app_permissions" ("app_id");
CREATE INDEX IF NOT EXISTS "idx_app_perms_user" ON "app_permissions" ("user_id");
