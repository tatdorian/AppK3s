#!/usr/bin/env node
import { program } from 'commander';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.appk3s');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return {};
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
}

function saveConfig(config) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function apiRequest(path, options = {}) {
  const cfg = loadConfig();
  if (!cfg.apiUrl || !cfg.apiKey) {
    console.error('Not configured. Run: appk3s login --url <URL> --key <API_KEY>');
    process.exit(1);
  }
  const res = await fetch(`${cfg.apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': cfg.apiKey,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Error ${res.status}: ${text}`);
    process.exit(1);
  }
  return res.json();
}

program
  .name('appk3s')
  .description('AppK3s CLI — manage your Kubernetes applications')
  .version('0.1.0');

program
  .command('login')
  .description('Configure the CLI with your AppK3s instance')
  .requiredOption('--url <url>', 'AppK3s API URL (e.g. https://appk3s.example.com/api)')
  .requiredOption('--key <key>', 'API key (create one in AppK3s → API Keys)')
  .action((opts) => {
    saveConfig({ apiUrl: opts.url, apiKey: opts.key });
    console.log('Configuration saved to', CONFIG_FILE);
  });

program
  .command('apps')
  .description('List all applications')
  .action(async () => {
    const apps = await apiRequest('/apps');
    if (!apps.length) { console.log('No applications found.'); return; }
    console.log('\nApplications:\n');
    apps.forEach(a => console.log(`  ${a.status === 'running' ? '[running]' : '[stopped]'} ${a.name.padEnd(30)} ${a.status.padEnd(12)} ${a.image ?? a.type}`));
    console.log();
  });

program
  .command('deploy <appName>')
  .description('Deploy an application')
  .action(async (appName) => {
    const apps = await apiRequest('/apps');
    const app = apps.find(a => a.name === appName);
    if (!app) { console.error(`App "${appName}" not found.`); process.exit(1); }
    await apiRequest(`/apps/${app.id}/deploy`, { method: 'POST' });
    console.log(`Deployment started for ${appName}`);
  });

program
  .command('logs <appName>')
  .description('Get logs for an application')
  .option('-n, --tail <lines>', 'Number of lines to show', '100')
  .action(async (appName, opts) => {
    const apps = await apiRequest('/apps');
    const app = apps.find(a => a.name === appName);
    if (!app) { console.error(`App "${appName}" not found.`); process.exit(1); }
    const data = await apiRequest(`/apps/${app.id}/logs?tail=${opts.tail}`);
    console.log(data.logs || 'No logs available');
  });

program
  .command('status <appName>')
  .description('Get status of an application')
  .action(async (appName) => {
    const apps = await apiRequest('/apps');
    const app = apps.find(a => a.name === appName);
    if (!app) { console.error(`App "${appName}" not found.`); process.exit(1); }
    const status = await apiRequest(`/apps/${app.id}/status`);
    console.log(`\n${appName}: ${app.status}`);
    console.log(`Replicas: ${status.readyReplicas ?? 0}/${status.desiredReplicas ?? app.replicas}`);
    if (status.accessUrl) console.log(`URL: ${status.accessUrl}`);
    console.log();
  });

program
  .command('stop <appName>')
  .description('Stop an application')
  .action(async (appName) => {
    const apps = await apiRequest('/apps');
    const app = apps.find(a => a.name === appName);
    if (!app) { console.error(`App "${appName}" not found.`); process.exit(1); }
    await apiRequest(`/apps/${app.id}/stop`, { method: 'POST' });
    console.log(`${appName} stopped`);
  });

program
  .command('start <appName>')
  .description('Start an application')
  .action(async (appName) => {
    const apps = await apiRequest('/apps');
    const app = apps.find(a => a.name === appName);
    if (!app) { console.error(`App "${appName}" not found.`); process.exit(1); }
    await apiRequest(`/apps/${app.id}/start`, { method: 'POST' });
    console.log(`${appName} started`);
  });

program.parse();
