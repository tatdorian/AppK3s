import { db } from '../db/index.js';
import { schema } from '../db/index.js';
import { and, eq } from 'drizzle-orm';
import { sendMail, emailTemplates } from './email.service.js';

export type NotificationEvent =
  | 'deploy.success'
  | 'deploy.fail'
  | 'alert.triggered'
  | 'backup.fail'
  | 'backup.success';

export interface NotificationContext {
  appName?: string;
  appId?: string;
  error?: string;
  url?: string;
  ruleName?: string;
  metric?: string;
  value?: number;
  configName?: string;
  sizeBytes?: number;
}

export async function dispatchNotification(
  event: NotificationEvent,
  userId: string,
  ctx: NotificationContext,
): Promise<void> {
  // Fetch enabled channels for this user that subscribe to this event
  const allChannels = await db.query.notificationChannels.findMany({
    where: and(
      eq(schema.notificationChannels.userId, userId),
      eq(schema.notificationChannels.enabled, true),
    ),
  });

  // Filter channels that have this event in their events array
  const channels = allChannels.filter((ch) => {
    const events = ch.events as string[];
    return events.length === 0 || events.includes(event);
  });

  for (const ch of channels) {
    try {
      if (ch.type === 'email') {
        const email = (ch.config as Record<string, string>).email;
        if (!email) continue;

        let tpl: { subject: string; html: string };

        switch (event) {
          case 'deploy.success':
            tpl = emailTemplates.deploySuccess(ctx.appName ?? 'unknown', ctx.url);
            break;
          case 'deploy.fail':
            tpl = emailTemplates.deployFail(ctx.appName ?? 'unknown', ctx.error ?? 'Unknown error');
            break;
          case 'alert.triggered':
            tpl = emailTemplates.alert(
              ctx.ruleName ?? 'unknown',
              ctx.appName ?? 'unknown',
              ctx.metric ?? 'unknown',
              ctx.value ?? 0,
            );
            break;
          case 'backup.fail':
            tpl = emailTemplates.backupFail(ctx.configName ?? 'unknown', ctx.error ?? 'Unknown error');
            break;
          case 'backup.success':
            tpl = emailTemplates.backupSuccess(ctx.configName ?? 'unknown', ctx.sizeBytes);
            break;
          default:
            continue;
        }

        await sendMail({ to: email, ...tpl });
      } else if (['webhook', 'discord', 'slack'].includes(ch.type)) {
        const url = (ch.config as Record<string, string>).url;
        if (!url) continue;

        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, ...ctx, timestamp: new Date().toISOString() }),
        });
      }
    } catch (err) {
      console.error(`Notification channel ${ch.id} failed:`, err);
    }
  }
}
