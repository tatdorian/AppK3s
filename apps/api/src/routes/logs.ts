import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { KubernetesService } from '../services/kubernetes.service.js';

const k8s = new KubernetesService();

export async function logsRoutes(app: FastifyInstance) {
  // GET /api/apps/:id/logs  (last N lines, no stream)
  app.get<{ Params: { id: string }; Querystring: { tail?: number } }>(
    '/:id/logs',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const application = await db.query.applications.findFirst({
        where: eq(schema.applications.id, request.params.id),
      });
      if (!application) return reply.code(404).send({ error: 'Not Found' });

      try {
        const pods = await k8s.listPods(application);
        if (!pods.length) return { logs: '' };
        const logs = await k8s.getPodLogs(
          application.namespace,
          pods[0].name,
          request.query.tail ?? 200,
        );
        return { logs };
      } catch (err: any) {
        return { logs: '', error: err.message };
      }
    },
  );

  // WS /api/apps/:id/logs/stream
  app.get<{ Params: { id: string } }>(
    '/:id/logs/stream',
    { websocket: true },
    async (socket, request) => {
      // Verify JWT from query param (browsers can't set WS headers)
      const token = (request.query as any).token as string | undefined;
      if (!token) {
        socket.send(JSON.stringify({ type: 'error', data: 'Missing token' }));
        socket.close();
        return;
      }

      try {
        app.jwt.verify(token);
      } catch {
        socket.send(JSON.stringify({ type: 'error', data: 'Invalid token' }));
        socket.close();
        return;
      }

      const application = await db.query.applications.findFirst({
        where: eq(schema.applications.id, request.params.id),
      });
      if (!application) {
        socket.send(JSON.stringify({ type: 'error', data: 'App not found' }));
        socket.close();
        return;
      }

      let cleanup: (() => void) | undefined;

      try {
        const pods = await k8s.listPods(application);
        if (!pods.length) {
          socket.send(JSON.stringify({ type: 'info', data: 'No pods running' }));
          return;
        }

        cleanup = await k8s.streamPodLogs(
          application.namespace,
          pods[0].name,
          (line: string) => {
            if (socket.readyState === 1 /* OPEN */) {
              socket.send(JSON.stringify({ type: 'log', data: line }));
            }
          },
        );
      } catch (err: any) {
        socket.send(JSON.stringify({ type: 'error', data: err.message }));
      }

      socket.on('close', () => {
        cleanup?.();
      });
    },
  );
}
