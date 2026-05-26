-- 0006_deployment_triggered_by.sql — Traçabilité : qui a déclenché quel déploiement
ALTER TABLE "deployments"
  ADD COLUMN IF NOT EXISTS "triggered_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_deployments_triggered_by"
  ON "deployments" ("triggered_by_id");
