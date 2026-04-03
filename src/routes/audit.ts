import { FastifyInstance } from 'fastify';
import { logEventoTecnico } from '../controllers/auditController';
import { authenticateJWT } from '../middlewares/auth';

export async function auditRoutes(fastify: FastifyInstance) {
    fastify.post('/audit/tecnico', { preHandler: authenticateJWT }, logEventoTecnico);
}
