import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../config/database'
import { AuthenticatedUser } from '../types/shared'
import { verifyJWT } from '../utils/security'
import logger from '../utils/logger'

interface JWTPayload {
  id: number
  email: string
  tipo_usuario: string
}

export const authenticateJWT = async (request: FastifyRequest, reply: FastifyReply) => {
  let token: string | null = null
  const authHeader = request.headers.authorization
  const queryToken = (request.query as any)?.token

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7)
  } else if (queryToken) {
    // LGPD Security Warning: Tokens in query params are exposed in server logs and browser history.
    // We allow it only for backward compatibility in specific read-only file routes if needed,
    // but we should aim to migrate all clients to headers.
    token = queryToken
    logger.warn('JWT received via query parameter. This is deprecated for security reasons.', { path: request.url })
  }

  if (!token) {
    reply.code(401).send({ error: 'unauthorized', message: 'Token de acesso necessário no cabeçalho Authorization' })
    return
  }

  try {
    const decoded = verifyJWT(token) as JWTPayload

    // Buscar usuário completo no banco e perfis vinculados
    const usuario = await prisma.usuario.findUnique({
      where: { id: decoded.id },
      include: {
        paciente: { select: { id: true } },
        medico: { select: { id: true } }
      }
    })

    if (!usuario) {
      logger.warn('JWT valid but user not found', { userId: decoded.id })
      reply.code(401).send({ error: 'unauthorized', message: 'Usuário não encontrado' })
      return
    }

    // Anexa o usuário ao request com tipo correto e IDs de perfil resolvidos
    request.user = {
      id: usuario.id,
      email: usuario.email,
      tipo_usuario: usuario.tipo_usuario as any,
      pacienteId: usuario.paciente?.id || null,
      medicoId: usuario.medico?.id || null
    }
  } catch (error: any) {
    logger.debug('JWT verification failed', { error: error.message })
    reply.code(401).send({ error: 'unauthorized', message: 'Token inválido ou expirado' })
  }
}