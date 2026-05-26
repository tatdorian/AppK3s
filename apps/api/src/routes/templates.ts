import type { FastifyInstance } from 'fastify';
import { TEMPLATES } from '@appk3s/shared';

export async function templatesRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  // GET /api/templates
  fastify.get('/', auth, async () => TEMPLATES);

  // GET /api/templates/:id
  fastify.get<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    const tpl = TEMPLATES.find((t) => t.id === request.params.id);
    if (!tpl) return reply.code(404).send({ error: 'Template not found' });
    return tpl;
  });
}
