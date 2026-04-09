import { FastifyInstance } from 'fastify';
import { logEventoTecnico } from '../controllers/auditController';
import { authenticateJWT } from '../middlewares/auth';
import { requireAdmin } from '../middlewares/authorization';

export async function auditRoutes(fastify: FastifyInstance) {
    fastify.post('/audit/tecnico', { preHandler: [authenticateJWT, requireAdmin] }, logEventoTecnico);
}
