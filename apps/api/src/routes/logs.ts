import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { KubernetesService } from '../services/kubernetes.service.js';

const k8s = new KubernetesService();

export async function logsRoutes(app: FastifyInstance) {
  // GET /api/apps/:id/logs — static tail (last N lines)
  app.get<{ Params: { id: string }; Querystring: { tail?: number; pod?: string } }>(
    '/:id/logs',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const application = await db.query.applications.findFirst({
        where: eq(schema.applications.id, request.params.id),
      });
      if (!application) return reply.code(404).send({ error: 'Not Found' });

      try {
        const pods = await k8s.listPods(application);
        if (!pods.length) return { logs: '', pods: [] };

        const podName = request.query.pod ?? pods[0].name;
        const logs = await k8s.getPodLogs(
          application.namespace,
          podName,
          request.query.tail ?? 500,
        );
        return { logs, pods: pods.map((p) => p.name) };
      } catch (err: any) {
        return { logs: '', pods: [], error: err.message };
      }
    },
  );

  // WS /api/apps/:id/logs/stream — real-time streaming with pod selection
  app.get<{ Params: { id: string } }>(
    '/:id/logs/stream',
    { websocket: true },
    async (socket, request) => {
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

      // Track all active stream cleanups (one per pod being watched)
      const cleanups: Array<() => void> = [];
      let closed = false;

      const send = (type: string, data: string, pod?: string) => {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type, data, pod }));
        }
      };

      const startStreaming = async (podFilter?: string) => {
        // Stop previous streams
        cleanups.splice(0).forEach((fn) => fn());

        try {
          const pods = await k8s.listPods(application);
          if (!pods.length) {
            send('info', 'No running pods');
            return;
          }

          // Send available pod list so the client can render a selector
          send('pods', JSON.stringify(pods.map((p) => p.name)));

          const targetPods = podFilter
            ? pods.filter((p) => p.name === podFilter)
            : pods;

          if (!targetPods.length) {
            send('info', `Pod "${podFilter}" not found`);
            return;
          }

          for (const pod of targetPods) {
            if (closed) break;
            const cleanup = await k8s.streamPodLogs(
              application.namespace,
              pod.name,
              (line: string) => send('log', line, pod.name),
            );
            cleanups.push(cleanup);
          }
        } catch (err: any) {
          send('error', err.message);
        }
      };

      // Handle client messages (e.g. switch pod)
      socket.on('message', async (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'select-pod') {
            await startStreaming(msg.pod || undefined);
          }
        } catch { /* ignore malformed messages */ }
      });

      socket.on('close', () => {
        closed = true;
        cleanups.splice(0).forEach((fn) => fn());
      });

      await startStreaming((request.query as any).pod);
    },
  );
}
