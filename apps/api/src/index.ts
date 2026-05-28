import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import authPlugin from './plugins/auth.js';
import { registerRoutes } from './routes/index.js';
import { startWorkers } from './workers/index.js';

const app = Fastify({
  logger: {
    transport: config.isDev
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
  // Enable rawBody for webhook signature validation
  // (add addContentTypeParser for raw body access in webhook routes)
});

async function bootstrap() {
  await app.register(cors, {
    origin: config.isDev ? '*' : process.env.ALLOWED_ORIGINS?.split(',') ?? [],
    credentials: true,
  });

  await app.register(websocket);
  await app.register(authPlugin);

  await registerRoutes(app);

  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`AppK3s API running on :${config.port}`);

  // Start background workers (backup scheduler + alert checker)
  await startWorkers();
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
