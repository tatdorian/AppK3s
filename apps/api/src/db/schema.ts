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

export const appTypeEnum = pgEnum('app_type', ['docker-image', 'compose', 'github', 'git', 'github-app']);
export const buildTypeEnum = pgEnum('build_type', ['nixpacks', 'dockerfile', 'docker-compose', 'static']);
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
  // token sent by email to let a new user set their password (one-time use, 7 days TTL)
  setupToken: varchar('setup_token', { length: 255 }),
  setupTokenExpiresAt: timestamp('setup_token_expires_at'),
  // GitHub App OAuth — links a GitHub account to this user
  githubId: varchar('github_id', { length: 255 }),
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

  // GitHub source (type === 'github') — legacy PAT mode
  githubUrl: text('github_url'),
  githubToken: text('github_token'),
  githubUsername: varchar('github_username', { length: 255 }),
  githubBranch: varchar('github_branch', { length: 255 }).default('main'),
  githubComposePath: varchar('github_compose_path', { length: 500 }).default('docker-compose.yml'),

  // ── GitHub App deployment (type === 'github-app') ───────────────────────
  githubInstallationId: uuid('github_installation_id'),
  githubRepoFullName: text('github_repo_full_name'),

  // ── Coolify-like Git build fields (type === 'git') ──────────────────────
  gitSourceId: uuid('git_source_id').references(() => gitSources.id, { onDelete: 'set null' }),
  gitRepoUrl: text('git_repo_url'),
  gitBranch: varchar('git_branch', { length: 255 }).default('main'),
  buildType: buildTypeEnum('build_type'),            // nixpacks | dockerfile | docker-compose | static
  buildDir: varchar('build_dir', { length: 500 }).default('.'),
  dockerfilePath: varchar('dockerfile_path', { length: 500 }).default('Dockerfile'),
  installCommand: text('install_command'),
  buildCommand: text('build_command'),
  startCommand: text('start_command'),
  publishDir: varchar('publish_dir', { length: 500 }).default('public'), // static builds
  webhookSecret: varchar('webhook_secret', { length: 255 }),
  autoDeploy: boolean('auto_deploy').notNull().default(false),
  lastCommitSha: varchar('last_commit_sha', { length: 40 }),
  lastCommitMessage: text('last_commit_message'),

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
  // Git metadata (for traceability & rollback)
  commitSha: varchar('commit_sha', { length: 40 }),
  commitMessage: text('commit_message'),
  imageTag: varchar('image_tag', { length: 500 }),  // e.g. appk3s/myapp:abc123def
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

// ── Git Sources (OAuth connections) ──────────────────────────────────────────

export const gitSources = pgTable('git_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 20 }).notNull(), // 'github' | 'gitlab'
  name: varchar('name', { length: 255 }).notNull(),
  providerId: varchar('provider_id', { length: 255 }),
  username: varchar('username', { length: 255 }),
  avatarUrl: text('avatar_url'),
  accessToken: text('access_token').notNull(), // encrypted
  refreshToken: text('refresh_token'),         // GitLab only
  tokenExpiresAt: timestamp('token_expires_at'),
  scopes: text('scopes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Projects ─────────────────────────────────────────────────────────────────

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  /** Domaine wildcard propre au projet, ex: "proj-a.example.com" — surcharge le wildcard global */
  wildcardDomain: varchar('wildcard_domain', { length: 255 }),
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
export type DbGitSource = typeof gitSources.$inferSelect;

// ── S3 Storages ───────────────────────────────────────────────────────────────
export const s3Storages = pgTable('s3_storages', {
  id:          uuid('id').primaryKey().defaultRandom(),
  name:        varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  endpoint:    text('endpoint').notNull(),
  region:      varchar('region', { length: 100 }).notNull().default('us-east-1'),
  bucket:      varchar('bucket', { length: 255 }).notNull(),
  accessKey:   text('access_key').notNull(),   // encrypted
  secretKey:   text('secret_key').notNull(),   // encrypted
  pathStyle:   boolean('path_style').notNull().default(false),
  isDefault:   boolean('is_default').notNull().default(false),
  createdBy:   uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
});

export type DbS3Storage = typeof s3Storages.$inferSelect;

// GitHub App — tables gérées via raw SQL (schema Drizzle non requis pour ces tables)
export interface DbGithubInstallation {
  id: string;
  installationId: number;
  userId: string | null;
  accountLogin: string;
  accountType: string;
  accountAvatarUrl: string | null;
  repositorySelection: string;
  suspended: boolean;
  createdAt: Date;
}
