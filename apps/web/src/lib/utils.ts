import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function relativeTime(date: string | Date) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function statusColor(status: string) {
  switch (status) {
    case 'running':
      return 'text-emerald-400 bg-emerald-400/10';
    case 'deploying':
      return 'text-blue-400 bg-blue-400/10';
    case 'stopped':
      return 'text-slate-400 bg-slate-400/10';
    case 'error':
      return 'text-red-400 bg-red-400/10';
    default:
      return 'text-slate-400 bg-slate-400/10';
  }
}

export function statusDot(status: string) {
  switch (status) {
    case 'running':
      return 'bg-emerald-400';
    case 'deploying':
      return 'bg-blue-400 animate-pulse';
    case 'stopped':
      return 'bg-slate-500';
    case 'error':
      return 'bg-red-400';
    default:
      return 'bg-slate-500';
  }
}
