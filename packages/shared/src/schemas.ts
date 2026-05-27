import { z } from 'zod';

export const envVarSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export const portSchema = z.object({
  containerPort: z.number().int().min(1).max(65535),
  protocol: z.enum(['TCP', 'UDP']).default('TCP'),
});

export const volumeSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
  mountPath: z.string().min(1).startsWith('/'),
  size: z.string().default('1Gi'),
  storageClass: z.string().optional(),
});

export const createAppSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
  namespace: z.string().default('default'),
  projectId: z.string().uuid().optional(), // null → assigned to Default project
  type: z.enum(['docker-image', 'compose', 'github']),
  templateId: z.string().optional(),
  image: z.string().optional(),
  imageTag: z.string().default('latest'),
  composeContent: z.string().optional(),
  // GitHub source
  githubUrl: z.string().url().optional(),
  githubToken: z.string().optional(),
  githubUsername: z.string().optional(),
  githubBranch: z.string().optional(),
  githubComposePath: z.string().optional(),
  envVars: z.array(envVarSchema).default([]),
  ports: z.array(portSchema).default([]),
  volumes: z.array(volumeSchema).default([]),
  subdomain: z.string().optional(),
  domain: z.string().optional(),
  ingressClass: z.string().default('traefik'),
  tlsEnabled: z.boolean().default(false),
  replicas: z.number().int().min(0).max(50).default(1),
  cpuLimit: z.string().optional(),
  memoryLimit: z.string().optional(),
});

// type is immutable after creation; name is editable (triggers k8s resource rename)
export const updateAppSchema = createAppSchema.partial().omit({ type: true });

// ── App-level roles ───────────────────────────────────────────────────────────
export const appRoleSchema = z.enum(['owner', 'editor', 'viewer']);

export const inviteMemberSchema = z.object({
  userId: z.string().uuid(),
  role: appRoleSchema.default('viewer'),
});

export const updateMemberRoleSchema = z.object({
  role: appRoleSchema,
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

// ── Project-level schemas ─────────────────────────────────────────────────────
export const projectRoleSchema = z.enum(['owner', 'member', 'viewer']);

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

export const inviteProjectMemberSchema = z.object({
  userId: z.string().uuid(),
  role: projectRoleSchema.default('viewer'),
});

export const updateProjectMemberRoleSchema = z.object({
  role: projectRoleSchema,
});

// ProjectRole is defined in types.ts — re-use it here via z.infer (same shape)
// export type ProjectRole = z.infer<typeof projectRoleSchema>; // removed: duplicate
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type InviteProjectMemberInput = z.infer<typeof inviteProjectMemberSchema>;
export type UpdateProjectMemberRoleInput = z.infer<typeof updateProjectMemberRoleSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type CreateAppInput = z.infer<typeof createAppSchema>;
export type UpdateAppInput = z.infer<typeof updateAppSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
