import type { FastifyInstance } from 'fastify';
import { KubernetesService } from '../services/kubernetes.service.js';

const k8s = new KubernetesService();

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
}
