import { readFileSync } from 'fs';
import type { FastifyInstance } from 'fastify';
import { KubernetesService } from '../services/kubernetes.service.js';

const k8s = new KubernetesService();

const K3S_TOKEN_PATH = '/var/lib/rancher/k3s/server/node-token';

export async function nodesRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  // GET /api/nodes
  fastify.get('/', auth, async (_request, reply) => {
    try {
      const nodes = await k8s.listNodes();
      return nodes;
    } catch (err: any) {
      return reply.code(500).send({ error: 'KubernetesError', message: err.message });
    }
  });

  // GET /api/nodes/join-command — commande pour ajouter un worker au cluster
  fastify.get('/join-command', auth, async (_request, reply) => {
    try {
      // Lire le token K3s depuis le fichier sur le master
      let token: string;
      try {
        token = readFileSync(K3S_TOKEN_PATH, 'utf8').trim();
      } catch {
        return reply.code(503).send({
          error: 'TokenUnavailable',
          message: `Impossible de lire ${K3S_TOKEN_PATH} — ce endpoint doit tourner sur le master K3s.`,
        });
      }

      // Récupérer l'IP du nœud control-plane
      const nodes = await k8s.listNodes();
      const master = nodes.find((n) =>
        n.roles.some((r) => r === 'control-plane' || r === 'master'),
      );
      const masterIP = master?.internalIP ?? '192.168.188.10';

      const command = `curl -sfL https://get.k3s.io | K3S_URL=https://${masterIP}:6443 K3S_TOKEN=${token} sh -`;

      return { command, masterIP, token };
    } catch (err: any) {
      return reply.code(500).send({ error: 'KubernetesError', message: err.message });
    }
  });
}
