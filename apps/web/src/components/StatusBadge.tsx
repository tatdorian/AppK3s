import { cn, statusColor, statusDot } from '../lib/utils.js';

interface Props {
  status: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: Props) {
  return (
    <span
      className={cn(
        'badge',
        statusColor(status),
        size === 'sm' ? 'text-[10px] px-1.5' : '',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', statusDot(status))} />
      {status}
    </span>
  );
}
