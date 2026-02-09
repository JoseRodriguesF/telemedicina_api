import { FastifyInstance } from 'fastify';
import {
    createPrescricao,
    getPrescricoesByConsulta,
    updatePrescricao,
    deletePrescricao,
    getSugestoesMedicamentos,
    getSugestoesMarcas
} from '../controllers/prescricoesController';
import { authenticateJWT } from '../middlewares/auth';

export default async function prescricoesRoutes(fastify: FastifyInstance) {
    // Rotas protegidas
    fastify.post('/prescricoes', { preHandler: authenticateJWT }, createPrescricao as any);
    fastify.get('/prescricoes/consulta/:consultaId', { preHandler: authenticateJWT }, getPrescricoesByConsulta as any);
    fastify.put('/prescricoes/:id', { preHandler: authenticateJWT }, updatePrescricao as any);
    fastify.delete('/prescricoes/:id', { preHandler: authenticateJWT }, deletePrescricao as any);

    // Rotas de sugestões
    fastify.get('/prescricoes/sugestoes/medicamentos', { preHandler: authenticateJWT }, getSugestoesMedicamentos as any);
    fastify.get('/prescricoes/sugestoes/marcas', { preHandler: authenticateJWT }, getSugestoesMarcas as any);
}
