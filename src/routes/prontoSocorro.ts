import { FastifyInstance } from 'fastify'
import { authenticateJWT } from '../middlewares/auth'
import { claimConsulta, criarSalaConsulta, listarFila, listarSalasEmAndamento, getHistoricoConsultas, getHistoricoCompleto } from '../controllers/prontoSocorroController'

export default async function prontoSocorroRoutes(fastify: FastifyInstance) {
  fastify.route({ method: 'POST', url: '/ps/rooms', preHandler: authenticateJWT, handler: criarSalaConsulta })
  fastify.route({ method: 'GET', url: '/ps/fila', preHandler: authenticateJWT, handler: listarFila })
  fastify.route({ method: 'POST', url: '/ps/fila/:consultaId/claim', preHandler: authenticateJWT, handler: claimConsulta })
  fastify.route({ method: 'GET', url: '/ps/salas-em-andamento', preHandler: authenticateJWT, handler: listarSalasEmAndamento })
  fastify.route({ method: 'GET', url: '/ps/historico', preHandler: authenticateJWT, handler: getHistoricoConsultas })
  fastify.route({ method: 'GET', url: '/ps/historico-completo', preHandler: authenticateJWT, handler: getHistoricoCompleto })
}
