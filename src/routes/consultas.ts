import { FastifyInstance } from 'fastify'
import { createOrGetRoom, endConsulta, listParticipants, joinRoom } from '../controllers/consultasController'
import { authenticateJWT } from '../middlewares/auth'

export default async function consultasRoutes(fastify: FastifyInstance) {
  fastify.route({ method: 'POST', url: '/consultas/:id/room', preHandler: authenticateJWT, handler: createOrGetRoom })
  fastify.route({ method: 'POST', url: '/consultas/:id/join', preHandler: authenticateJWT, handler: joinRoom })
  fastify.route({ method: 'GET',  url: '/consultas/:id/participants', preHandler: authenticateJWT, handler: listParticipants })
  fastify.route({ method: 'POST', url: '/consultas/:id/end', preHandler: authenticateJWT, handler: endConsulta })
}
