-- Add templateId to applications
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "template_id" varchar(100);

-- New settings keys
INSERT INTO "settings" ("key", "value") VALUES ('wildcardDomain',   '') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "settings" ("key", "value") VALUES ('interfaceDomain',  '') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "settings" ("key", "value") VALUES ('acmeEmail',        '') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "settings" ("key", "value") VALUES ('ovhAppKey',        '') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "settings" ("key", "value") VALUES ('ovhAppSecret',     '') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "settings" ("key", "value") VALUES ('ovhConsumerKey',   '') ON CONFLICT ("key") DO NOTHING;
