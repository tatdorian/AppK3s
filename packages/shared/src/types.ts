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
  createdAt: string;
  updatedAt: string;
}

export interface Deployment {
  id: string;
  applicationId: string;
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
}

export interface AppStatusInfo {
  availableReplicas: number;
  desiredReplicas: number;
  readyReplicas: number;
  pods: K8sPodInfo[];
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
