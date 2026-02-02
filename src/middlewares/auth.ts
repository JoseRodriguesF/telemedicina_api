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
  const authHeader = request.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Token de acesso necessário' })
  }

  const token = authHeader.substring(7) // Remove 'Bearer '

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
      return reply.code(401).send({ error: 'unauthorized', message: 'Usuário não encontrado' })
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
    return reply.code(401).send({ error: 'unauthorized', message: 'Token inválido ou expirado' })
  }
}