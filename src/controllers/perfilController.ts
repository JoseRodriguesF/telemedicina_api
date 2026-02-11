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

            // 1. Criar uma cópia profunda segura para manipulação
            // Importante destruir buffers ANTES para não pesar no stringify
            const rawMedico = profile.medico as any
            const mData = rawMedico ? {
                tem_diploma: !!rawMedico.diploma_data,
                tem_especializacao: !!rawMedico.especializacao_data,
                tem_assinatura: !!rawMedico.assinatura_digital_data,
                tem_seguro: !!rawMedico.seguro_responsabilidade_data
            } : null

            // 2. Clone simples para limpar o objeto do Prisma
            const result = JSON.parse(JSON.stringify(profile))

            // 3. Mapeamento para snake_case e nomes consistentes com o Login
            result.registro_full = result.registroFull
            delete result.registroFull

            // Sanitizar sensíveis
            delete result.senha_hash
            delete result.google_id
            delete result.senha

            // 4. Injetar flags e dados de raiz para consistência com objeto de login
            if (result.medico && mData) {
                // Mesclar flags de existência
                Object.assign(result.medico, mData)

                // Garantir remoção de binários caso o stringify os tenha incluído como meta-objetos
                delete result.medico.diploma_data
                delete result.medico.especializacao_data
                delete result.medico.assinatura_digital_data
                delete result.medico.seguro_responsabilidade_data

                // Campos de raiz (compatível com auth.ts e login)
                result.nome = result.medico.nome_completo
                result.verificacao = result.medico.verificacao
            } else if (result.paciente) {
                result.nome = result.paciente.nome_completo
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
