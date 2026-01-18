import { FastifyInstance } from 'fastify'
import { createOrGetRoom, endConsulta, listParticipants, joinRoom, createRoomSimple, listConsultasAgendadas, listMedicos, agendarConsulta } from '../controllers/consultasController'
import { authenticateJWT } from '../middlewares/auth'

export default async function consultasRoutes(fastify: FastifyInstance) {
  fastify.route({ method: 'POST', url: '/consultas/:id/room', preHandler: authenticateJWT, handler: createOrGetRoom })
  // Novo endpoint: criar sala sem consulta
  fastify.route({ method: 'POST', url: '/rooms', preHandler: authenticateJWT, handler: createRoomSimple })
  // Agendamentos
  fastify.route({ method: 'POST', url: '/consultas/agendar', preHandler: authenticateJWT, handler: agendarConsulta })
  fastify.route({ method: 'GET', url: '/consultas/agendadas', preHandler: authenticateJWT, handler: listConsultasAgendadas })
  fastify.route({ method: 'GET', url: '/medicos', preHandler: authenticateJWT, handler: listMedicos })
  fastify.route({ method: 'POST', url: '/consultas/:id/join', preHandler: authenticateJWT, handler: joinRoom })
  fastify.route({ method: 'GET',  url: '/consultas/:id/participants', preHandler: authenticateJWT, handler: listParticipants })
  fastify.route({ method: 'POST', url: '/consultas/:id/end', preHandler: authenticateJWT, handler: endConsulta })
}
