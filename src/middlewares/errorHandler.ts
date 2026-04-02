import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import logger from '../utils/logger'

/**
 * Middleware global de tratamento de erros - HARDENED
 * Garante respostas consistentes e NUNCA vaza detalhes técnicos (Stack Traces).
 */
export function errorHandler(
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply
) {
    const { method, url } = request

    // Log interno detalhado (Seguro: apenas o administrador vê no log)
    logger.error('Request error captured by global handler', {
        method,
        url,
        statusCode: error.statusCode || 500,
        errorCode: error.code,
        errorMessage: error.message,
        stack: error.stack // O stack trace fica apenas no log interno
    })

    // Determinar status code
    const statusCode = error.statusCode || 500

    // Resposta padronizada OPACA (Segurança: O atacante não vê o stack)
    const response: {
        error: string
        message?: string
        statusCode: number
    } = {
        error: error.code || 'INTERNAL_ERROR',
        message: statusCode === 500 ? 'Um erro interno ocorreu. O incidente foi reportado aos administradores.' : error.message,
        statusCode
    }

    reply.status(statusCode).send(response)
}
