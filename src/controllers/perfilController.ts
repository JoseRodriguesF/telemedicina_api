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

            // 1. Antes de qualquer serialização, capturar flags e REMOVER buffers para não travar o processo
            const medico = profile.medico as any
            let mFlags: any = null
            if (medico) {
                mFlags = {
                    tem_diploma: !!medico.diploma_data,
                    tem_especializacao: !!medico.especializacao_data,
                    tem_assinatura: !!medico.assinatura_digital_data,
                    tem_seguro: !!medico.seguro_responsabilidade_data
                }
                // Remover binários do objeto ORIGINAL antes do stringify
                delete medico.diploma_data
                delete medico.especializacao_data
                delete medico.assinatura_digital_data
                delete medico.seguro_responsabilidade_data
            }

            // 2. Agora sim, converter para JSON limpo com segurança
            const result = JSON.parse(JSON.stringify(profile))

            // 3. Mapeamento para snake_case consistente com Login
            result.registro_full = result.registroFull
            delete result.registroFull

            // Sanitizar sensíveis
            delete result.senha_hash
            delete result.google_id
            delete result.senha

            // 4. Injetar flags e dados de raiz
            if (result.medico && mFlags) {
                Object.assign(result.medico, mFlags)
                result.nome = result.medico.nome_completo
                result.verificacao = result.medico.verificacao
            } else if (result.paciente) {
                result.nome = result.paciente.nome_completo
                if (result.paciente.historiaClinicaResumo) {
                    result.paciente.historia_clinica = result.paciente.historiaClinicaResumo
                    delete result.paciente.historiaClinicaResumo
                }
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
