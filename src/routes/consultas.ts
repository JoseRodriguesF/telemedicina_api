import { FastifyInstance } from 'fastify'
import { createOrGetRoom, endConsulta, listParticipants, joinRoom, createRoomSimple, listConsultasAgendadas, listMedicos, agendarConsulta, confirmarConsulta, cancelarConsulta, getConsultaDetails, avaliarConsulta } from '../controllers/consultasController'
import { authenticateJWT } from '../middlewares/auth'

export default async function consultasRoutes(fastify: FastifyInstance) {
  fastify.get('/consultas/:id', { preHandler: authenticateJWT }, getConsultaDetails as any)
  fastify.post('/consultas/:id/room', { preHandler: authenticateJWT }, createOrGetRoom as any)
  fastify.post('/rooms', { preHandler: authenticateJWT }, createRoomSimple as any)

  // Agendamentos
  fastify.post('/consultas/agendar', { preHandler: authenticateJWT }, agendarConsulta as any)
  fastify.get('/consultas/agendadas', { preHandler: authenticateJWT }, listConsultasAgendadas as any)
  fastify.patch('/consultas/:id/confirmar', { preHandler: authenticateJWT }, confirmarConsulta as any)
  fastify.delete('/consultas/:id', { preHandler: authenticateJWT }, cancelarConsulta as any)

  fastify.get('/medicos', { preHandler: authenticateJWT }, listMedicos as any)
  fastify.post('/consultas/:id/join', { preHandler: authenticateJWT }, joinRoom as any)
  fastify.get('/consultas/:id/participants', { preHandler: authenticateJWT }, listParticipants as any)
  fastify.post('/consultas/:id/end', { preHandler: authenticateJWT }, endConsulta as any)
  fastify.post('/consultas/:id/avaliacao', { preHandler: authenticateJWT }, avaliarConsulta as any)
}
