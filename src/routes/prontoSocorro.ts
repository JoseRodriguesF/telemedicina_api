import { FastifyInstance } from 'fastify'
import { authenticateJWT } from '../middlewares/auth'
import { claimConsulta, criarSalaConsulta, listarFila } from '../controllers/prontoSocorroController'

export default async function prontoSocorroRoutes(fastify: FastifyInstance) {
  fastify.route({ method: 'POST', url: '/ps/rooms', preHandler: authenticateJWT, handler: criarSalaConsulta })
  fastify.route({ method: 'GET',  url: '/ps/fila',  preHandler: authenticateJWT, handler: listarFila })
  fastify.route({ method: 'POST', url: '/ps/fila/:consultaId/claim', preHandler: authenticateJWT, handler: claimConsulta })
}
