import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { KubernetesService } from '../services/kubernetes.service.js';
import * as k8s from '@kubernetes/client-node';
import { PassThrough } from 'stream';

const k8sSvc = new KubernetesService();

// Access the kc field via a small subclass helper
class TerminalK8sService extends KubernetesService {
  getKubeConfig(): k8s.KubeConfig {
    return this.kc;
  }
}

const termK8s = new TerminalK8sService();

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export async function terminalRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  // ── GET /api/apps/:id/terminal/pods ───────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id/terminal/pods', auth, async (request, reply) => {
    const { sub: userId, role } = request.user;

    const application = await db.query.applications.findFirst({
      where: eq(schema.applications.id, request.params.id),
    });
    if (!application) {
      return reply.code(404).send({ error: 'Not Found', message: 'Application not found' });
    }

    // Simple access check: admin or has any membership
    if (role !== 'admin') {
      const appMembership = await db.query.appPermissions.findFirst({
        where: (t, { and, eq: deq }) => and(
          deq(t.appId, application.id),
          deq(t.userId, userId),
        ),
      });
      if (!appMembership) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
      }
    }

    try {
      const pods = await k8sSvc.listPods(application);
      const runningPods = pods.filter((p) => p.phase === 'Running').map((p) => p.name);
      return runningPods;
    } catch (err: any) {
      return reply.code(500).send({ error: 'KubernetesError', message: err.message });
    }
  });

  // ── WS /api/apps/:id/terminal ──────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/:id/terminal',
    { websocket: true },
    async (socket, request) => {
      const query = request.query as {
        token?: string;
        pod?: string;
        container?: string;
      };

      // Verify JWT from query param
      const token = query.token;
      if (!token) {
        socket.send(JSON.stringify({ type: 'error', data: 'Missing token' }));
        socket.close();
        return;
      }

      let jwtPayload: { sub: string; email: string; role: string };
      try {
        jwtPayload = fastify.jwt.verify<{ sub: string; email: string; role: string }>(token);
      } catch {
        socket.send(JSON.stringify({ type: 'error', data: 'Invalid token' }));
        socket.close();
        return;
      }

      const appId = request.params.id;
      const application = await db.query.applications.findFirst({
        where: eq(schema.applications.id, appId),
      });
      if (!application) {
        socket.send(JSON.stringify({ type: 'error', data: 'Application not found' }));
        socket.close();
        return;
      }

      // Access check
      if (jwtPayload.role !== 'admin') {
        const appMembership = await db.query.appPermissions.findFirst({
          where: (t, { and, eq: deq }) => and(
            deq(t.appId, application.id),
            deq(t.userId, jwtPayload.sub),
          ),
        });
        if (!appMembership) {
          socket.send(JSON.stringify({ type: 'error', data: 'Access denied' }));
          socket.close();
          return;
        }
      }

      // Get pod to exec into
      let podName = query.pod;
      if (!podName) {
        try {
          const pods = await k8sSvc.listPods(application);
          const running = pods.find((p) => p.phase === 'Running');
          if (!running) {
            socket.send(JSON.stringify({ type: 'error', data: 'No running pods found' }));
            socket.close();
            return;
          }
          podName = running.name;
        } catch (err: any) {
          socket.send(JSON.stringify({ type: 'error', data: `Failed to list pods: ${err.message}` }));
          socket.close();
          return;
        }
      }

      const containerName = query.container ?? application.name;
      const namespace = application.namespace;

      // Set up exec streams
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const stdin = new PassThrough();

      stdout.on('data', (chunk: Buffer) => {
        if (socket.readyState === 1 /* OPEN */) {
          socket.send(JSON.stringify({ type: 'data', data: chunk.toString('utf8') }));
        }
      });

      stderr.on('data', (chunk: Buffer) => {
        if (socket.readyState === 1 /* OPEN */) {
          socket.send(JSON.stringify({ type: 'data', data: chunk.toString('utf8') }));
        }
      });

      // Inactivity timeout
      let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

      function resetInactivityTimer() {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({ type: 'error', data: 'Session timeout due to inactivity' }));
            socket.close();
          }
        }, INACTIVITY_TIMEOUT_MS);
      }

      resetInactivityTimer();

      // Start exec
      const kc = termK8s.getKubeConfig();
      const exec = new k8s.Exec(kc);

      let execAbortController: AbortController | null = null;

      // Try /bin/sh first, fall back to /bin/bash
      const command = ['/bin/sh'];

      try {
        execAbortController = new AbortController();
        await exec.exec(
          namespace,
          podName,
          containerName,
          command,
          stdout,
          stderr,
          stdin,
          true, // tty
          (status) => {
            if (socket.readyState === 1) {
              socket.send(JSON.stringify({ type: 'exit', data: status?.status ?? 'unknown' }));
            }
            socket.close();
          },
        );
      } catch {
        // Try /bin/bash if /bin/sh failed
        try {
          await exec.exec(
            namespace,
            podName,
            containerName,
            ['/bin/bash'],
            stdout,
            stderr,
            stdin,
            true,
            (status) => {
              if (socket.readyState === 1) {
                socket.send(JSON.stringify({ type: 'exit', data: status?.status ?? 'unknown' }));
              }
              socket.close();
            },
          );
        } catch (err: any) {
          socket.send(JSON.stringify({ type: 'error', data: `Failed to exec into pod: ${err.message}` }));
          socket.close();
          return;
        }
      }

      // Handle messages from client
      socket.on('message', (rawMsg: Buffer | string) => {
        try {
          resetInactivityTimer();
          const msg = JSON.parse(rawMsg.toString()) as {
            type: 'input' | 'resize';
            data?: string;
            cols?: number;
            rows?: number;
          };

          if (msg.type === 'input' && msg.data !== undefined) {
            stdin.write(msg.data);
          }
          // resize is handled client-side via xterm; server-side TTY resize
          // would require a more complex k8s exec implementation
        } catch {
          // Ignore malformed messages
        }
      });

      socket.on('close', () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        stdin.destroy();
        stdout.destroy();
        stderr.destroy();
        execAbortController?.abort();
      });
    },
  );
}
