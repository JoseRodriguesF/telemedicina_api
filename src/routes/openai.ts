import { FastifyInstance } from 'fastify'
import { openaiChatController, confirmTriagemController } from '../controllers/openaiController'
import { authenticateJWT } from '../middlewares/auth'

export async function openaiRoutes(fastify: FastifyInstance) {
  fastify.route({
    method: 'POST',
    url: '/chat-ia',
    preHandler: authenticateJWT,
    handler: openaiChatController
  })

  fastify.route({
    method: 'POST',
    url: '/chat-ia/confirmar',
    preHandler: authenticateJWT,
    handler: confirmTriagemController
  })
}
