import { FastifyInstance } from 'fastify'
import { createOrGetRoom, endConsulta, listParticipants, joinRoom, createRoomSimple, getRoomStatus } from '../controllers/consultasController'
import { authenticateJWT } from '../middlewares/auth'

export default async function consultasRoutes(fastify: FastifyInstance) {
  fastify.route({ method: 'POST', url: '/consultas/:id/room', preHandler: authenticateJWT, handler: createOrGetRoom })
  fastify.route({ method: 'GET', url: '/consultas/:id/room/status', preHandler: authenticateJWT, handler: getRoomStatus })
  // Novo endpoint: criar sala sem consulta
  fastify.route({ method: 'POST', url: '/rooms', preHandler: authenticateJWT, handler: createRoomSimple })
  fastify.route({ method: 'POST', url: '/consultas/:id/join', preHandler: authenticateJWT, handler: joinRoom })
  fastify.route({ method: 'GET',  url: '/consultas/:id/participants', preHandler: authenticateJWT, handler: listParticipants })
  fastify.route({ method: 'POST', url: '/consultas/:id/end', preHandler: authenticateJWT, handler: endConsulta })
}
