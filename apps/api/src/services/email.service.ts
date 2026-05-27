import nodemailer from 'nodemailer';
import { db } from '../db/index.js';

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

async function getSmtpConfig(): Promise<SmtpConfig> {
  // Try DB settings first (managed via Settings page)
  const rows = await db.query.settings.findMany();
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;

  return {
    host:   s['smtpHost']   || process.env.SMTP_HOST   || '',
    port:   parseInt(s['smtpPort'] || process.env.SMTP_PORT || '587', 10),
    user:   s['smtpUser']   || process.env.SMTP_USER   || '',
    pass:   s['smtpPass']   || process.env.SMTP_PASS   || '',
    from:   s['smtpFrom']   || process.env.SMTP_FROM   || '',
    secure: (s['smtpSecure'] ?? process.env.SMTP_SECURE ?? '') === 'true',
  };
}

export async function sendMail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  const smtp = await getSmtpConfig();
  if (!smtp.host) throw new Error('SMTP not configured');

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });

  await transporter.sendMail({
    from: smtp.from || smtp.user,
    to: Array.isArray(opts.to) ? opts.to.join(', ') : opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}

// HTML email templates
export const emailTemplates = {
  deploySuccess: (appName: string, url?: string) => ({
    subject: `Deployment successful — ${appName}`,
    html: `<h2>Deployment Successful</h2><p>Application <strong>${appName}</strong> was deployed successfully.${url ? ` <a href="${url}">Open application</a>` : ''}</p>`,
  }),

  deployFail: (appName: string, error: string) => ({
    subject: `Deployment failed — ${appName}`,
    html: `<h2>Deployment Failed</h2><p>Deployment of <strong>${appName}</strong> failed.</p><pre style="background:#f4f4f4;padding:12px;border-radius:4px;">${error}</pre>`,
  }),

  alert: (ruleName: string, appName: string, metric: string, value: number) => ({
    subject: `Alert triggered — ${ruleName}`,
    html: `<h2>Alert Triggered</h2><p>Rule <strong>${ruleName}</strong> was triggered for application <strong>${appName}</strong>.</p><p>Metric: ${metric} = ${value.toFixed(1)}</p>`,
  }),

  backupFail: (configName: string, error: string) => ({
    subject: `Backup failed — ${configName}`,
    html: `<h2>Backup Failed</h2><p>Backup <strong>${configName}</strong> failed.</p><pre style="background:#f4f4f4;padding:12px;border-radius:4px;">${error}</pre>`,
  }),

  backupSuccess: (configName: string, sizeBytes?: number) => ({
    subject: `Backup successful — ${configName}`,
    html: `<h2>Backup Successful</h2><p>Backup <strong>${configName}</strong> completed successfully.${sizeBytes ? ` Size: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB` : ''}</p>`,
  }),

  invite: (email: string, projectName: string) => ({
    subject: `Invitation to join ${projectName}`,
    html: `<h2>Invitation</h2><p>${email}, you have been invited to join project <strong>${projectName}</strong> on AppK3s.</p>`,
  }),
};
