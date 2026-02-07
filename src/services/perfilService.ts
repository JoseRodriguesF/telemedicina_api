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
}
