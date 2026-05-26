export type AppType = 'docker-image' | 'compose';

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
