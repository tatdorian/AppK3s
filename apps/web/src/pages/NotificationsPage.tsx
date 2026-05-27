import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Plus,
  Trash2,
  Loader2,
  ToggleLeft,
  ToggleRight,
  SendHorizonal,
  Mail,
  Webhook,
} from 'lucide-react';
import { notificationsApi } from '../lib/api.js';
import type { NotificationChannel, NotificationChannelType } from '@appk3s/shared';
import toast from 'react-hot-toast';

const AVAILABLE_EVENTS = [
  { id: 'deploy.success', label: 'Deployment succeeded' },
  { id: 'deploy.fail',    label: 'Deployment failed' },
  { id: 'alert.triggered',label: 'Alert triggered' },
  { id: 'backup.fail',    label: 'Backup failed' },
  { id: 'backup.success', label: 'Backup succeeded' },
];

const CHANNEL_ICONS: Record<NotificationChannelType, React.ElementType> = {
  email:   Mail,
  webhook: Webhook,
  discord: Bell,
  slack:   Bell,
};

// ─── Create Channel Modal ─────────────────────────────────────────────────────
function CreateChannelModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<NotificationChannelType>('email');
  const [email, setEmail] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);

  const toggleEvent = (id: string) => {
    setEvents((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );
  };

  const buildConfig = (): Record<string, string> => {
    if (type === 'email') return { email };
    return { url: webhookUrl };
  };

  const createMut = useMutation({
    mutationFn: () =>
      notificationsApi.createChannel({
        name,
        type,
        config: buildConfig(),
        events,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-channels'] });
      toast.success('Notification channel created');
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err?.response?.data?.message ?? 'Failed to create channel'),
  });

  const isValid = name.trim() && (type === 'email' ? email.trim() : webhookUrl.trim());

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <Bell className="w-4 h-4 text-accent" /> Add notification channel
        </h2>

        <div>
          <label className="label">Name</label>
          <input
            className="input"
            placeholder="My email alerts"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className="label">Type</label>
          <select
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value as NotificationChannelType)}
          >
            <option value="email">Email</option>
            <option value="webhook">Webhook (custom)</option>
            <option value="discord">Discord webhook</option>
            <option value="slack">Slack webhook</option>
          </select>
        </div>

        {type === 'email' ? (
          <div>
            <label className="label">Email address</label>
            <input
              className="input"
              type="email"
              placeholder="alerts@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        ) : (
          <div>
            <label className="label">Webhook URL</label>
            <input
              className="input"
              type="url"
              placeholder="https://…"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
          </div>
        )}

        <div>
          <label className="label">
            Events{' '}
            <span className="text-slate-500 font-normal">(empty = all events)</span>
          </label>
          <div className="space-y-1 mt-1">
            {AVAILABLE_EVENTS.map((ev) => (
              <label key={ev.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={events.includes(ev.id)}
                  onChange={() => toggleEvent(ev.id)}
                  className="w-3.5 h-3.5 rounded accent-accent"
                />
                <span className="text-sm text-slate-300">{ev.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!isValid || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Channel Row ───────────────────────────────────────────────────────────────
function ChannelRow({ channel }: { channel: NotificationChannel }) {
  const qc = useQueryClient();

  const toggleMut = useMutation({
    mutationFn: () =>
      notificationsApi.updateChannel(channel.id, { enabled: !channel.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-channels'] }),
    onError: () => toast.error('Failed to update channel'),
  });

  const deleteMut = useMutation({
    mutationFn: () => notificationsApi.deleteChannel(channel.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-channels'] });
      toast.success('Channel deleted');
    },
    onError: () => toast.error('Failed to delete channel'),
  });

  const testMut = useMutation({
    mutationFn: () => notificationsApi.testChannel(channel.id),
    onSuccess: () => toast.success('Test notification sent!'),
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err?.response?.data?.message ?? 'Test failed'),
  });

  const Icon = CHANNEL_ICONS[channel.type as NotificationChannelType] ?? Bell;

  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-slate-700/40 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => toggleMut.mutate()}
          disabled={toggleMut.isPending}
          className="text-slate-400 hover:text-accent transition-colors shrink-0"
        >
          {channel.enabled ? (
            <ToggleRight className="w-5 h-5 text-green-400" />
          ) : (
            <ToggleLeft className="w-5 h-5" />
          )}
        </button>
        <div className="w-7 h-7 rounded bg-surface-300 flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-accent" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-white">{channel.name}</p>
          <p className="text-xs text-slate-500 mt-0.5 capitalize">
            {channel.type}
            {channel.events.length > 0 && (
              <span> · {channel.events.length} events</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          className="btn-ghost p-1.5 text-slate-400 hover:text-blue-400"
          title="Send test notification"
          onClick={() => testMut.mutate()}
          disabled={testMut.isPending}
        >
          {testMut.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <SendHorizonal className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          className="btn-ghost p-1.5 text-slate-400 hover:text-red-400"
          title="Delete channel"
          onClick={() => {
            if (confirm(`Delete channel "${channel.name}"?`)) deleteMut.mutate();
          }}
          disabled={deleteMut.isPending}
        >
          {deleteMut.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function NotificationsPage() {
  const [showCreate, setShowCreate] = useState(false);

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ['notification-channels'],
    queryFn: notificationsApi.listChannels,
  });

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="text-slate-400 text-sm mt-1">
            Configure how you receive deployment and alert notifications.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> Add channel
        </button>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold text-white">Notification channels</h2>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No notification channels configured.</p>
            <button
              className="btn-primary mt-3 text-sm"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="w-4 h-4" /> Add your first channel
            </button>
          </div>
        ) : (
          <div>
            {channels.map((ch) => (
              <ChannelRow key={ch.id} channel={ch} />
            ))}
          </div>
        )}
      </div>

      <div className="card p-4">
        <h3 className="text-xs font-semibold text-slate-400 mb-2">Supported events</h3>
        <div className="grid grid-cols-2 gap-1">
          {AVAILABLE_EVENTS.map((ev) => (
            <div key={ev.id} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="text-xs text-slate-400">{ev.label}</span>
            </div>
          ))}
        </div>
      </div>

      {showCreate && <CreateChannelModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
