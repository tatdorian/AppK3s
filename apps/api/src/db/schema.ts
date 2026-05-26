import {
  boolean,
  integer,
  json,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
// Note: boolean is still used by applications.tlsEnabled
import type { EnvVar, Port, Volume } from '@appk3s/shared';

export const appTypeEnum = pgEnum('app_type', ['docker-image', 'compose']);
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

export type DbUser = typeof users.$inferSelect;
export type DbApplication = typeof applications.$inferSelect;
export type DbDeployment = typeof deployments.$inferSelect;
export type DbSetting = typeof settings.$inferSelect;
export type DbAppPermission = typeof appPermissions.$inferSelect;
export type DbProject = typeof projects.$inferSelect;
export type DbProjectMember = typeof projectMembers.$inferSelect;
