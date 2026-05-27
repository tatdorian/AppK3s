export type AppType = 'docker-image' | 'compose' | 'github';

export type AppStatus = 'idle' | 'deploying' | 'running' | 'stopped' | 'error';

export type DeploymentStatus = 'pending' | 'running' | 'success' | 'failed';

export interface EnvVar {
  key: string;
  value: string;
}

export interface Port {
  containerPort: number;
  protocol: 'TCP' | 'UDP';
}

export interface Volume {
  name: string;
  mountPath: string;
  size: string;
  storageClass?: string;
}

export interface DomainConfig {
  subdomain?: string;
  domain?: string;
  ingressClass: string;
  tlsEnabled: boolean;
}

export interface Application {
  id: string;
  name: string;
  namespace: string;
  type: AppType;
  status: AppStatus;
  image?: string;
  imageTag: string;
  composeContent?: string;
  // GitHub source (type === 'github')
  githubUrl?: string;
  githubToken?: string;
  githubUsername?: string;
  githubBranch?: string;
  githubComposePath?: string;
  envVars: EnvVar[];
  ports: Port[];
  volumes: Volume[];
  subdomain?: string;
  domain?: string;
  ingressClass: string;
  tlsEnabled: boolean;
  replicas: number;
  cpuLimit?: string;
  memoryLimit?: string;
  /** Overrides the Docker CMD (keeps ENTRYPOINT). Used for images that need explicit server args (e.g. MinIO). */
  args?: string[];
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Deployment {
  id: string;
  applicationId: string;
  triggeredById?: string | null;
  triggeredByEmail?: string | null;
  status: DeploymentStatus;
  logs: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface User {
  id: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface K8sPodInfo {
  name: string;
  phase: string;
  ready: boolean;
  restarts: number;
  age: string;
  node: string;
}

export interface ServicePortInfo {
  name: string;
  port: number;
  targetPort: number;
  nodePort?: number;
  protocol: string;
}

export interface AppStatusInfo {
  availableReplicas: number;
  desiredReplicas: number;
  readyReplicas: number;
  pods: K8sPodInfo[];
  servicePorts: ServicePortInfo[];
  accessUrl?: string;
  nodePortUrls: string[];  // ex: ["http://192.168.188.10:32196", "http://192.168.188.20:32196"]
}

export interface NodeInfo {
  name: string;
  roles: string[];
  ready: boolean;
  internalIP: string;
  osImage: string;
  kernelVersion: string;
  containerRuntime: string;
  k8sVersion: string;
  age: string;
  // Allocatable resources
  cpuAllocatable: string;
  memoryAllocatable: string;
  podsAllocatable: string;
  // Live metrics (null if metrics-server not available)
  cpuUsage: string | null;
  memoryUsage: string | null;
}

export interface ClusterSettings {
  defaultDomain: string;
  defaultIngressClass: string;
  defaultTls: string;
  // Wildcard domain & TLS
  wildcardDomain: string;
  interfaceDomain: string;
  masterNodeIp: string;
  acmeEmail: string;
  ovhAppKey: string;
  ovhAppSecret: string;
  ovhConsumerKey: string;
  // SMTP
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  smtpSecure: string;
}

export type AppRole = 'owner' | 'editor' | 'viewer';

export interface AppMember {
  userId: string;
  email: string;
  globalRole: string;            // 'admin' | 'viewer'
  appRole: AppRole | null;       // explicit per-app permission
  projectRole: ProjectRole | null; // access via project membership
  createdAt: string | null;
}

export interface AppMyRole {
  role: AppRole | null;    // null = not a member
  isAdmin: boolean;
}

export interface AppPermission {
  id: string;
  appId: string;
  userId: string;
  role: AppRole;
  createdAt: string;
}

// ── Projects ─────────────────────────────────────────────────────────────────

export type ProjectRole = 'owner' | 'member' | 'viewer';

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  appCount?: number;
  myRole?: ProjectRole | null;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  email: string;
  globalRole: string;
  role: ProjectRole;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

// ── API Keys ──────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/** Returned only once on creation */
export interface ApiKeyCreated extends ApiKey {
  key: string;
}

// ── Notification Channels ─────────────────────────────────────────────────────

export type NotificationChannelType = 'email' | 'webhook' | 'discord' | 'slack';

export interface NotificationChannel {
  id: string;
  userId: string;
  name: string;
  type: NotificationChannelType;
  config: Record<string, string>;
  enabled: boolean;
  events: string[];
  createdAt: string;
}

// ── Alert Rules ───────────────────────────────────────────────────────────────

export type AlertMetric = 'cpu_percent' | 'memory_percent' | 'pod_restarts';
export type AlertOperator = 'gt' | 'lt';

export interface AlertRule {
  id: string;
  userId: string;
  appId: string | null;
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  durationMinutes: number;
  enabled: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
}

// ── Backup Configs ────────────────────────────────────────────────────────────

export interface S3BackupConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKey: string;
  secretKey: string;
  prefix?: string;
}

export interface BackupConfig {
  id: string;
  appId: string;
  name: string;
  schedule: string;
  destination: 'local' | 's3';
  s3Config?: S3BackupConfig | null;
  localPath?: string | null;
  retentionDays: number;
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
}

// ── Backup Runs ───────────────────────────────────────────────────────────────

export type BackupRunStatus = 'running' | 'success' | 'failed';

export interface BackupRun {
  id: string;
  configId: string;
  status: BackupRunStatus;
  sizeBytes: number | null;
  durationMs: number | null;
  destinationPath: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}
