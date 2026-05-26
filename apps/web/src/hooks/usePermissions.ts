import { useQuery } from '@tanstack/react-query';
import { appsApi } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

export type AppRole = 'owner' | 'editor' | 'viewer';

export interface AppCapabilities {
  role: AppRole | 'admin' | null;
  isAdmin: boolean;
  canView: boolean;
  canDeploy: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageTeam: boolean;
  isLoading: boolean;
}

const ADMIN_CAPS: AppCapabilities = {
  role: 'admin',
  isAdmin: true,
  canView: true,
  canDeploy: true,
  canEdit: true,
  canDelete: true,
  canManageTeam: true,
  isLoading: false,
};

const ROLE_CAPS: Record<AppRole, Omit<AppCapabilities, 'role' | 'isAdmin' | 'isLoading'>> = {
  owner:  { canView: true, canDeploy: true,  canEdit: true,  canDelete: true,  canManageTeam: true  },
  editor: { canView: true, canDeploy: true,  canEdit: true,  canDelete: false, canManageTeam: false },
  viewer: { canView: true, canDeploy: false, canEdit: false, canDelete: false, canManageTeam: false },
};

export function useAppPermissions(appId: string): AppCapabilities {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const { data, isLoading } = useQuery({
    queryKey: ['apps', appId, 'my-role'],
    queryFn: () => appsApi.getMyRole(appId),
    enabled: !isAdmin && !!appId && !!user,
    staleTime: 30_000,
  });

  if (isAdmin) return ADMIN_CAPS;

  if (!data?.role) {
    return {
      role: null, isAdmin: false,
      canView: false, canDeploy: false, canEdit: false, canDelete: false, canManageTeam: false,
      isLoading,
    };
  }

  const role = data.role as AppRole;
  return {
    role,
    isAdmin: false,
    ...ROLE_CAPS[role],
    isLoading: false,
  };
}
