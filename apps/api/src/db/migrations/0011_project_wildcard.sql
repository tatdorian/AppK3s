-- Add wildcard_domain per project
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "wildcard_domain" varchar(255);
