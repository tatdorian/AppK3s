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

  welcomeUser: (email: string, setupUrl: string) => ({
    subject: 'Bienvenue sur AK3s — Configurez votre mot de passe',
    html: `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#f59e0b,#d97706,#b45309);padding:32px;text-align:center;">
            <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 18px;margin-bottom:12px;">
              <span style="font-size:28px;">🐯</span>
            </div>
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">AK3s</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Kubernetes App Manager</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 8px;color:#f1f5f9;font-size:18px;font-weight:600;">Bienvenue sur AK3s !</h2>
            <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;line-height:1.6;">
              Un compte a été créé pour <strong style="color:#e2e8f0;">${email}</strong>.<br>
              Cliquez sur le bouton ci-dessous pour définir votre mot de passe et accéder à la plateforme.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${setupUrl}" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:8px;letter-spacing:0.2px;">
                Définir mon mot de passe →
              </a>
            </div>
            <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;text-align:center;">
              Ce lien est valable <strong>7 jours</strong>.<br>
              Si vous n'attendiez pas cet email, ignorez-le simplement.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #334155;text-align:center;">
            <p style="margin:0;color:#475569;font-size:11px;">
              AK3s — Kubernetes App Manager
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    text: `Bienvenue sur AK3s !\n\nUn compte a été créé pour ${email}.\n\nCliquez sur ce lien pour définir votre mot de passe :\n${setupUrl}\n\nCe lien est valable 7 jours.\n\nSi vous n'attendiez pas cet email, ignorez-le.`,
  }),
};
