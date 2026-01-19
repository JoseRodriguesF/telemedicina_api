import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import logger from '../utils/logger'

/**
 * Middleware global de tratamento de erros
 * Garante respostas consistentes e logging adequado
 */
export function errorHandler(
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply
) {
    const { method, url } = request

    // Log do erro
    logger.error('Request error', error, {
        method,
        url,
        statusCode: error.statusCode || 500,
        errorCode: error.code
    })

    // Determinar status code
    const statusCode = error.statusCode || 500

    // Resposta padronizada
    const response: {
        error: string
        message?: string
        details?: string
        statusCode: number
    } = {
        error: error.code || 'INTERNAL_ERROR',
        statusCode
    }

    // Adicionar mensagem se disponível
    if (error.message) {
        response.message = error.message
    }

    // Em desenvolvimento, adicionar stack trace
    if (process.env.NODE_ENV === 'development' && error.stack) {
        response.details = error.stack
    }

    reply.status(statusCode).send(response)
}
