import { FastifyInstance } from 'fastify';
import { logEventoTecnico } from '../controllers/auditController';

export async function auditRoutes(fastify: FastifyInstance) {
    fastify.post('/audit/tecnico', logEventoTecnico);
}
