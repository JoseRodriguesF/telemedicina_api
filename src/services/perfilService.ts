import prisma from '../config/database'
import ApiError from '../utils/apiError'
import { sanitizeText, sanitizePhone, sanitizeCPF } from '../utils/security'
import logger from '../utils/logger'

export class PerfilService {
    async getFullProfile(usuarioId: number) {
        const usuario = await prisma.usuario.findUnique({
            where: { id: usuarioId },
            include: {
                paciente: true,
                medico: true,
                enderecos: true,
            }
        })

        if (!usuario) {
            throw new ApiError('Usuário não encontrado.', 404, 'USER_NOT_FOUND')
        }

        return usuario
    }

    async updateProfile(usuarioId: number, data: any) {
        const usuario = await prisma.usuario.findUnique({
            where: { id: usuarioId },
            include: { paciente: true, medico: true }
        })

        if (!usuario) {
            throw new ApiError('Usuário não encontrado.', 404, 'USER_NOT_FOUND')
        }

        // Update business logic based on role
        const isMedico = usuario.tipo_usuario === 'medico'
        const isPaciente = usuario.tipo_usuario === 'paciente'

        try {
            return await prisma.$transaction(async (tx) => {
                // 1. Update Usuario (email)
                if (data.email) {
                    const existing = await tx.usuario.findUnique({ where: { email: data.email } })
                    if (existing && existing.id !== usuarioId) {
                        throw new ApiError('Email já está em uso.', 409, 'EMAIL_ALREADY_EXISTS')
                    }
                    await tx.usuario.update({
                        where: { id: usuarioId },
                        data: { email: data.email }
                    })
                }

                // 2. Update Patient or Doctor data
                if (isPaciente && usuario.paciente) {
                    const updateData: any = {}
                    if (data.nome_completo) updateData.nome_completo = sanitizeText(data.nome_completo)
                    if (data.telefone) updateData.telefone = sanitizePhone(data.telefone)
                    if (data.sexo) updateData.sexo = data.sexo
                    if (data.estado_civil) updateData.estado_civil = data.estado_civil
                    if (data.data_nascimento) updateData.data_nascimento = new Date(data.data_nascimento)
                    if (data.historia_clinica) updateData.historiaClinicaResumo = sanitizeText(data.historia_clinica)

                    if (Object.keys(updateData).length > 0) {
                        await tx.paciente.update({
                            where: { id: usuario.paciente.id },
                            data: updateData
                        })
                    }
                } else if (isMedico && usuario.medico) {
                    const updateData: any = {}
                    if (data.nome_completo) updateData.nome_completo = sanitizeText(data.nome_completo)
                    if (data.sexo) updateData.sexo = data.sexo
                    if (data.data_nascimento) updateData.data_nascimento = new Date(data.data_nascimento)
                    if (data.crm) updateData.crm = data.crm
                    if (data.resumo_profissional) updateData.resumo_profissional = sanitizeText(data.resumo_profissional)

                    // Documentos em Banco (Dados Binários)
                    if (data.diploma && data.diploma.data) {
                        updateData.diploma_data = Buffer.from(data.diploma.data, 'base64')
                        updateData.diploma_mimetype = data.diploma.mimetype
                    }
                    if (data.especializacao && data.especializacao.data) {
                        updateData.especializacao_data = Buffer.from(data.especializacao.data, 'base64')
                        updateData.especializacao_mimetype = data.especializacao.mimetype
                    }
                    if (data.assinatura_digital && data.assinatura_digital.data) {
                        updateData.assinatura_digital_data = Buffer.from(data.assinatura_digital.data, 'base64')
                        updateData.assinatura_digital_mimetype = data.assinatura_digital.mimetype
                    }
                    if (data.seguro_responsabilidade && data.seguro_responsabilidade.data) {
                        updateData.seguro_responsabilidade_data = Buffer.from(data.seguro_responsabilidade.data, 'base64')
                        updateData.seguro_responsabilidade_mimetype = data.seguro_responsabilidade.mimetype
                    }

                    if (Object.keys(updateData).length > 0) {
                        await tx.medico.update({
                            where: { id: usuario.medico.id },
                            data: updateData
                        })
                    }
                }

                // 3. Update Address
                if (data.endereco) {
                    const mainAddress = await tx.endereco.findFirst({
                        where: { usuario_id: usuarioId }
                    })

                    const addrData: any = {
                        endereco: sanitizeText(data.endereco.endereco),
                        numero: String(data.endereco.numero),
                        complemento: data.endereco.complemento ? sanitizeText(data.endereco.complemento) : null
                    }

                    if (mainAddress) {
                        await tx.endereco.update({
                            where: { id: mainAddress.id },
                            data: addrData
                        })
                    } else {
                        await tx.endereco.create({
                            data: {
                                usuario_id: usuarioId,
                                ...addrData
                            }
                        })
                    }
                }

                return { success: true }
            })
        } catch (error: any) {
            if (error instanceof ApiError) throw error
            logger.error('Failed to update profile', error, { usuarioId })
            throw new ApiError('Erro ao atualizar perfil.', 500, 'INTERNAL_ERROR')
        }
    }

    async getDocument(usuarioId: number, type: string) {
        const medico = await prisma.medico.findUnique({
            where: { usuario_id: usuarioId }
        })

        if (!medico) {
            throw new ApiError('Perfil médico não encontrado.', 404, 'USER_NOT_FOUND')
        }

        switch (type) {
            case 'diploma':
                return { data: medico.diploma_data, mimetype: medico.diploma_mimetype }
            case 'especializacao':
                return { data: medico.especializacao_data, mimetype: medico.especializacao_mimetype }
            case 'assinatura':
                return { data: medico.assinatura_digital_data, mimetype: medico.assinatura_digital_mimetype }
            case 'seguro':
                return { data: medico.seguro_responsabilidade_data, mimetype: medico.seguro_responsabilidade_mimetype }
            default:
                throw new ApiError('Tipo de documento inválido.', 400, 'INVALID_TYPE')
        }
    }
}
