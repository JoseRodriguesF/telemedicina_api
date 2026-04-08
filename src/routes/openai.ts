import { FastifyInstance } from 'fastify'
import { openaiChatController, confirmTriagemController, transcreverConsultaController, resumirTranscricaoController } from '../controllers/openaiController'
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

  fastify.route({
    method: 'POST',
    url: '/chat-ia/transcrever',
    preHandler: authenticateJWT,
    handler: transcreverConsultaController,
    bodyLimit: 50 * 1024 * 1024, // 50MB para áudios longos
  })

  fastify.route({
    method: 'POST',
    url: '/chat-ia/resumir',
    preHandler: authenticateJWT,
    handler: resumirTranscricaoController
  })
}
