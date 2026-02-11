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

            const result = profile as any

            // Pre-processar médico para remover binários e criar flags
            if (result.medico) {
                result.medico.tem_diploma = !!result.medico.diploma_data
                result.medico.tem_especializacao = !!result.medico.especializacao_data
                result.medico.tem_assinatura = !!result.medico.assinatura_digital_data
                result.medico.tem_seguro = !!result.medico.seguro_responsabilidade_data

                // Remover buffers pesados para não quebrar o JSON.stringify ou pesar no transporte
                delete result.medico.diploma_data
                delete result.medico.especializacao_data
                delete result.medico.assinatura_digital_data
                delete result.medico.seguro_responsabilidade_data

                // NÃO deletamos as URLs antigas aqui para manter compatibilidade com quem não migrou do Cloudinary
            }

            // Converter para objeto limpo para evitar circularidade do Prisma/instâncias complexas
            const responseData = JSON.parse(JSON.stringify(result))

            // Sanitizar sensíveis
            delete responseData.senha_hash
            delete responseData.senha
            delete responseData.google_id

            return reply.send(responseData)
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
