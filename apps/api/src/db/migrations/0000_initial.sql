-- AppK3s initial schema
CREATE TYPE "app_type" AS ENUM ('docker-image', 'compose');
CREATE TYPE "app_status" AS ENUM ('idle', 'deploying', 'running', 'stopped', 'error');
CREATE TYPE "deployment_status" AS ENUM ('pending', 'running', 'success', 'failed');

CREATE TABLE IF NOT EXISTS "users" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email"         varchar(255) NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "role"          varchar(50) NOT NULL DEFAULT 'admin',
  "created_at"    timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "applications" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"           varchar(255) NOT NULL UNIQUE,
  "namespace"      varchar(255) NOT NULL DEFAULT 'default',
  "type"           app_type NOT NULL,
  "status"         app_status NOT NULL DEFAULT 'idle',
  "image"          text,
  "image_tag"      varchar(100) DEFAULT 'latest',
  "compose_content" text,
  "env_vars"       json NOT NULL DEFAULT '[]',
  "ports"          json NOT NULL DEFAULT '[]',
  "volumes"        json NOT NULL DEFAULT '[]',
  "subdomain"      varchar(255),
  "domain"         varchar(255),
  "ingress_class"  varchar(100) NOT NULL DEFAULT 'traefik',
  "tls_enabled"    boolean NOT NULL DEFAULT false,
  "replicas"       integer NOT NULL DEFAULT 1,
  "cpu_limit"      varchar(50),
  "memory_limit"   varchar(50),
  "created_at"     timestamp NOT NULL DEFAULT now(),
  "updated_at"     timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "deployments" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "status"         deployment_status NOT NULL DEFAULT 'pending',
  "logs"           text NOT NULL DEFAULT '',
  "error"          text,
  "created_at"     timestamp NOT NULL DEFAULT now(),
  "completed_at"   timestamp
);

CREATE INDEX IF NOT EXISTS "idx_deployments_app" ON "deployments" ("application_id");
