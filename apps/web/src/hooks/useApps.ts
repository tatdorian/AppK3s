import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appsApi } from '../lib/api.js';
import type { CreateAppInput, UpdateAppInput } from '@appk3s/shared';
import toast from 'react-hot-toast';

export function useApps() {
  return useQuery({ queryKey: ['apps'], queryFn: appsApi.list });
}

export function useApp(id: string) {
  return useQuery({ queryKey: ['apps', id], queryFn: () => appsApi.get(id) });
}

export function useAppStatus(id: string) {
  return useQuery({
    queryKey: ['apps', id, 'status'],
    queryFn: () => appsApi.status(id),
    refetchInterval: 5000,
  });
}

export function useDeployments(id: string) {
  return useQuery({
    queryKey: ['apps', id, 'deployments'],
    queryFn: () => appsApi.deployments(id),
  });
}

export function useCreateApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAppInput) => appsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['apps'] });
      toast.success('Application created');
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Failed to create app'),
  });
}

export function useUpdateApp(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateAppInput) => appsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['apps', id] });
      toast.success('Saved');
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Failed to save'),
  });
}

export function useDeleteApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => appsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['apps'] });
      toast.success('Application deleted');
    },
    onError: () => toast.error('Failed to delete application'),
  });
}

export function useDeployApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => appsApi.deploy(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['apps', id] });
      toast.success('Deployment started');
    },
    onError: () => toast.error('Deployment failed to start'),
  });
}

export function useAppAction() {
  const qc = useQueryClient();

  const action = (fn: () => Promise<unknown>, id: string, label: string) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['apps', id] });
        toast.success(label);
      },
      onError: () => toast.error(`${label} failed`),
    });

  return {
    start: (id: string) => action(() => appsApi.start(id), id, 'Started'),
    stop: (id: string) => action(() => appsApi.stop(id), id, 'Stopped'),
    restart: (id: string) => action(() => appsApi.restart(id), id, 'Restarted'),
  };
}
