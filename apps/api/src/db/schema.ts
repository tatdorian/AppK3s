import {
  bigint,
  boolean,
  integer,
  json,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
// Note: boolean is still used by applications.tlsEnabled
import type { EnvVar, Port, Volume } from '@appk3s/shared';

export const appTypeEnum = pgEnum('app_type', ['docker-image', 'compose', 'github']);
export const appStatusEnum = pgEnum('app_status', [
  'idle',
  'deploying',
  'running',
  'stopped',
  'error',
]);
export const deploymentStatusEnum = pgEnum('deployment_status', [
  'pending',
  'running',
  'success',
  'failed',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 50 }).notNull().default('admin'),
  // true → user must change password before accessing the app
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const applications = pgTable('applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  namespace: varchar('namespace', { length: 255 }).notNull().default('default'),
  type: appTypeEnum('type').notNull(),
  status: appStatusEnum('status').notNull().default('idle'),

  // Docker image
  image: text('image'),
  imageTag: varchar('image_tag', { length: 100 }).default('latest'),

  // Compose
  composeContent: text('compose_content'),

  // GitHub source (type === 'github')
  githubUrl: text('github_url'),
  githubToken: text('github_token'),
  githubUsername: varchar('github_username', { length: 255 }),
  githubBranch: varchar('github_branch', { length: 255 }).default('main'),
  githubComposePath: varchar('github_compose_path', { length: 500 }).default('docker-compose.yml'),

  // Runtime config
  envVars: json('env_vars').$type<EnvVar[]>().notNull().default([]),
  ports: json('ports').$type<Port[]>().notNull().default([]),
  volumes: json('volumes').$type<Volume[]>().notNull().default([]),

  // Template
  templateId: varchar('template_id', { length: 100 }),

  // Domain config
  subdomain: varchar('subdomain', { length: 255 }),
  domain: varchar('domain', { length: 255 }),
  ingressClass: varchar('ingress_class', { length: 100 }).notNull().default('traefik'),
  tlsEnabled: boolean('tls_enabled').notNull().default(false),

  // Container command override (overrides Docker CMD, keeps ENTRYPOINT)
  args: json('args').$type<string[]>(),

  // Resources
  replicas: integer('replicas').notNull().default(1),
  cpuLimit: varchar('cpu_limit', { length: 50 }),
  memoryLimit: varchar('memory_limit', { length: 50 }),

  // Project grouping (nullable = belongs to Default project)
  projectId: uuid('project_id'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const deployments = pgTable('deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  triggeredById: uuid('triggered_by_id')
    .references(() => users.id, { onDelete: 'set null' }),
  status: deploymentStatusEnum('status').notNull().default('pending'),
  logs: text('logs').notNull().default(''),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export const settings = pgTable('settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: text('value').notNull().default(''),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const appPermissions = pgTable(
  'app_permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull().default('viewer'), // 'owner' | 'editor' | 'viewer'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
);

// ── Projects ─────────────────────────────────────────────────────────────────

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const projectMembers = pgTable('project_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // 'owner' → full access + team mgmt
  // 'member' → deploy + edit (no delete, no team)
  // 'viewer' → read-only
  role: varchar('role', { length: 20 }).notNull().default('viewer'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── API Keys ──────────────────────────────────────────────────────────────────
export const apiKeys = pgTable('api_keys', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name:        varchar('name', { length: 100 }).notNull(),
  keyHash:     text('key_hash').notNull().unique(),
  keyPrefix:   varchar('key_prefix', { length: 16 }).notNull(),
  lastUsedAt:  timestamp('last_used_at'),
  expiresAt:   timestamp('expires_at'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
});

// ── Notification channels ─────────────────────────────────────────────────────
export const notificationChannels = pgTable('notification_channels', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name:      varchar('name', { length: 100 }).notNull(),
  type:      varchar('type', { length: 20 }).notNull(), // 'email' | 'webhook' | 'discord' | 'slack'
  config:    json('config').notNull().$type<Record<string, string>>(),
  enabled:   boolean('enabled').default(true).notNull(),
  events:    json('events').notNull().$type<string[]>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Alert rules ───────────────────────────────────────────────────────────────
export const alertRules = pgTable('alert_rules', {
  id:              uuid('id').primaryKey().defaultRandom(),
  userId:          uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  appId:           uuid('app_id').references(() => applications.id, { onDelete: 'cascade' }),
  name:            varchar('name', { length: 100 }).notNull(),
  metric:          varchar('metric', { length: 50 }).notNull(), // 'cpu_percent' | 'memory_percent' | 'pod_restarts'
  operator:        varchar('operator', { length: 10 }).notNull(), // 'gt' | 'lt'
  threshold:       real('threshold').notNull(),
  durationMinutes: integer('duration_minutes').default(5).notNull(),
  enabled:         boolean('enabled').default(true).notNull(),
  lastTriggeredAt: timestamp('last_triggered_at'),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
});

// ── Backup configs ────────────────────────────────────────────────────────────
export const backupConfigs = pgTable('backup_configs', {
  id:            uuid('id').primaryKey().defaultRandom(),
  appId:         uuid('app_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  name:          varchar('name', { length: 100 }).notNull(),
  schedule:      varchar('schedule', { length: 100 }).notNull(), // cron
  destination:   varchar('destination', { length: 20 }).notNull(), // 'local' | 's3'
  s3Config:      json('s3_config').$type<{
    bucket: string; region: string; endpoint?: string;
    accessKey: string; secretKey: string; prefix?: string;
  }>(),
  localPath:     text('local_path'),
  retentionDays: integer('retention_days').default(30).notNull(),
  enabled:       boolean('enabled').default(true).notNull(),
  lastRunAt:     timestamp('last_run_at'),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
});

// ── Backup runs ───────────────────────────────────────────────────────────────
export const backupRuns = pgTable('backup_runs', {
  id:              uuid('id').primaryKey().defaultRandom(),
  configId:        uuid('config_id').notNull().references(() => backupConfigs.id, { onDelete: 'cascade' }),
  status:          varchar('status', { length: 20 }).notNull(), // 'running' | 'success' | 'failed'
  sizeBytes:       bigint('size_bytes', { mode: 'number' }),
  durationMs:      integer('duration_ms'),
  destinationPath: text('destination_path'),
  error:           text('error'),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
  completedAt:     timestamp('completed_at'),
});

export type DbUser = typeof users.$inferSelect;
export type DbApplication = typeof applications.$inferSelect;
export type DbDeployment = typeof deployments.$inferSelect;
export type DbSetting = typeof settings.$inferSelect;
export type DbAppPermission = typeof appPermissions.$inferSelect;
export type DbProject = typeof projects.$inferSelect;
export type DbProjectMember = typeof projectMembers.$inferSelect;
export type DbApiKey = typeof apiKeys.$inferSelect;
export type DbNotificationChannel = typeof notificationChannels.$inferSelect;
export type DbAlertRule = typeof alertRules.$inferSelect;
export type DbBackupConfig = typeof backupConfigs.$inferSelect;
export type DbBackupRun = typeof backupRuns.$inferSelect;
