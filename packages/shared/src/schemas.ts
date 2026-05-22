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
  type: z.enum(['docker-image', 'compose']),
  image: z.string().optional(),
  imageTag: z.string().default('latest'),
  composeContent: z.string().optional(),
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

export const updateAppSchema = createAppSchema.partial().omit({ name: true, type: true });

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
