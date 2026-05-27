-- API Keys
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "key_hash" text NOT NULL UNIQUE,
  "key_prefix" varchar(16) NOT NULL,
  "last_used_at" timestamp,
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Notification channels
CREATE TABLE IF NOT EXISTS "notification_channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "type" varchar(20) NOT NULL,
  "config" json NOT NULL DEFAULT '{}',
  "enabled" boolean NOT NULL DEFAULT true,
  "events" json NOT NULL DEFAULT '[]',
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Alert rules
CREATE TABLE IF NOT EXISTS "alert_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "app_id" uuid REFERENCES "applications"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "metric" varchar(50) NOT NULL,
  "operator" varchar(10) NOT NULL,
  "threshold" real NOT NULL,
  "duration_minutes" integer NOT NULL DEFAULT 5,
  "enabled" boolean NOT NULL DEFAULT true,
  "last_triggered_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Backup configs
CREATE TABLE IF NOT EXISTS "backup_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "app_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "schedule" varchar(100) NOT NULL,
  "destination" varchar(20) NOT NULL,
  "s3_config" json,
  "local_path" text,
  "retention_days" integer NOT NULL DEFAULT 30,
  "enabled" boolean NOT NULL DEFAULT true,
  "last_run_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Backup runs
CREATE TABLE IF NOT EXISTS "backup_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "config_id" uuid NOT NULL REFERENCES "backup_configs"("id") ON DELETE CASCADE,
  "status" varchar(20) NOT NULL,
  "size_bytes" bigint,
  "duration_ms" integer,
  "destination_path" text,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);
