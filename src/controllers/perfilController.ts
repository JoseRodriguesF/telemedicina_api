import { FastifyRequest, FastifyReply } from 'fastify'
import { PerfilService } from '../services/perfilService'
import { AuthenticatedUser } from '../types/shared'
import ApiError from '../utils/apiError'
import logger from '../utils/logger'

const perfilService = new PerfilService()

export class PerfilController {
    async getMe(request: FastifyRequest, reply: FastifyReply) {
        try {
            const user = request.user as AuthenticatedUser
            if (!user) {
                return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Sessão inválida' } })
            }

            const profile = await perfilService.getFullProfile(user.id)
            if (!profile) {
                return reply.code(404).send({ error: { code: 'USER_NOT_FOUND', message: 'Perfil não encontrado' } })
            }

            // Mapeamento manual para garantir estabilidade e remover sensitivos/buffers
            const result: any = {
                id: (profile as any).id,
                email: (profile as any).email,
                tipo_usuario: (profile as any).tipo_usuario,
                registroFull: (profile as any).registroFull,
                paciente: (profile as any).paciente ? { ...(profile as any).paciente } : null,
                medico: (profile as any).medico ? { ...(profile as any).medico } : null,
                enderecos: Array.isArray((profile as any).enderecos) ? [...(profile as any).enderecos] : []
            }

            // Se for médico, converter buffers em flags e remover binários da resposta JSON
            if (result.medico) {
                const m = result.medico
                m.tem_diploma = !!m.diploma_data
                m.tem_especializacao = !!m.especializacao_data
                m.tem_assinatura = !!m.assinatura_digital_data
                m.tem_seguro = !!m.seguro_responsabilidade_data

                // Remover buffers pesados do JSON de retorno
                delete m.diploma_data
                delete m.especializacao_data
                delete m.assinatura_digital_data
                delete m.seguro_responsabilidade_data

                // Remover URLs antigas se existirem
                delete m.diploma_url
                delete m.especializacao_url
                delete m.assinatura_digital_url
                delete m.seguro_responsabilidade_url
            }

            return reply.send(result)
        } catch (error: any) {
            if (error instanceof ApiError) {
                reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } })
            } else {
                logger.error('PerfilController.getMe unexpected error', error)
                reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno' } })
            }
        }
    }

    async updateMe(request: FastifyRequest, reply: FastifyReply) {
        try {
            const user = request.user as AuthenticatedUser
            if (!user) {
                return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Sessão inválida' } })
            }

            const result = await perfilService.updateProfile(user.id, request.body)
            reply.send(result)
        } catch (error: any) {
            if (error instanceof ApiError) {
                reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } })
            } else {
                logger.error('PerfilController.updateMe unexpected error', error)
                reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno' } })
            }
        }
    }

    async getDocument(request: FastifyRequest, reply: FastifyReply) {
        try {
            const user = request.user as AuthenticatedUser
            const { type } = request.params as { type: string }

            const doc = await perfilService.getDocument(user.id, type)
            if (!doc || !doc.data) {
                return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Documento não encontrado' } })
            }

            return reply.type(doc.mimetype || 'application/octet-stream').send(doc.data)
        } catch (error: any) {
            if (error instanceof ApiError) {
                reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } })
            } else {
                logger.error('PerfilController.getDocument unexpected error', error)
                reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno' } })
            }
        }
    }
}
