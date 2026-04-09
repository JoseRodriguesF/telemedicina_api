import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../config/database'
import { AuthenticatedUser } from '../types/shared'
import { logAuditoria } from '../utils/auditLogger'
import { decrypt } from '../utils/encryption'
import logger from '../utils/logger'

export class AdminController {
    /**
     * Retorna estatísticas gerais da plataforma com filtros de período
     */
    async getStats(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { ano, mes, dia, inicio, fim } = request.query as any
            
            // Construção do filtro de data
            let dateFilter: any = {}
            if (inicio && fim) {
                dateFilter = {
                    data_consulta: {
                        gte: new Date(inicio),
                        lte: new Date(fim)
                    }
                }
            } else if (ano) {
                const year = parseInt(ano)
                const start = new Date(year, 0, 1)
                const end = new Date(year, 11, 31)
                dateFilter = {
                    data_consulta: { gte: start, lte: end }
                }
                if (mes) {
                    const month = parseInt(mes) - 1
                    const startMonth = new Date(year, month, 1)
                    const endMonth = new Date(year, month + 1, 0)
                    dateFilter.data_consulta = { gte: startMonth, lte: endMonth }
                    
                    if (dia) {
                        const day = parseInt(dia)
                        const specificDate = new Date(year, month, day)
                        dateFilter.data_consulta = {
                            equals: specificDate
                        }
                    }
                }
            }

            // 1. Consultas para os gráficos (Apenas finalizadas para métricas de atendimento real)
            const chartsConsultations = await prisma.consulta.findMany({
                where: {
                    ...dateFilter,
                    status: 'finished'
                },
                select: {
                    hora_inicio: true,
                    paciente: { select: { sexo: true } },
                    medico: { select: { especialidade: true } },
                    cid: true
                }
            })

            // 2. Estatísticas Globais da Plataforma (Sem filtros de data para os totais gerais)
            const [totalPacientes, totalMedicos, totalConsultasGeral] = await Promise.all([
                prisma.usuario.count({ where: { tipo_usuario: 'paciente' } }),
                prisma.medico.count(),
                prisma.consulta.count()
            ])

            const hourlyStats: Record<number, number> = {}
            const specialtyGenderStats: Record<string, Record<string, number>> = {}
            const cidStats: Record<string, number> = {}

            chartsConsultations.forEach(c => {
                // Horários
                if (c.hora_inicio) {
                    const hour = new Date(c.hora_inicio).getUTCHours()
                    hourlyStats[hour] = (hourlyStats[hour] || 0) + 1
                }

                // Gênero x Especialidade
                const gender = c.paciente?.sexo || 'N/A'
                const specialty = c.medico?.especialidade || 'Geral'
                if (!specialtyGenderStats[specialty]) specialtyGenderStats[specialty] = {}
                specialtyGenderStats[specialty][gender] = (specialtyGenderStats[specialty][gender] || 0) + 1

                // CIDs
                if (c.cid) {
                    cidStats[c.cid] = (cidStats[c.cid] || 0) + 1
                }
            })

            // Formatar para o frontend
            const formattedHourly = Object.entries(hourlyStats)
                .map(([hour, count]) => ({ hour: parseInt(hour), count }))
                .sort((a, b) => a.hour - b.hour)

            const formattedSpecialty = Object.entries(specialtyGenderStats).map(([specialty, genders]) => ({
                specialty,
                ...genders
            }))

            const formattedCids = Object.entries(cidStats)
                .map(([cid, count]) => ({ cid, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10) // Top 10

            // 3. Recent Audit Logs for the dashboard preview
            const recentLogs = await prisma.trilhaAuditoria.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' }
            })

            return reply.send({
                hourly: formattedHourly,
                specialtyGender: formattedSpecialty,
                topCids: formattedCids,
                totalConsultations: totalConsultasGeral, // Agora retorna o total real da plataforma
                totalPatients: totalPacientes,
                totalDoctors: totalMedicos,
                finishedConsultationsCount: chartsConsultations.length,
                recentLogs
            })
        } catch (error) {
            logger.error('AdminController.getStats error', error)
            return reply.code(500).send({ error: 'Erro ao gerar estatísticas' })
        }
    }

    /**
     * Lista médicos aguardando verificação
     */
    async getPendingMedicos(request: FastifyRequest, reply: FastifyReply) {
        try {
            const medicos = await prisma.medico.findMany({
                where: { verificacao: 'analise' },
                select: {
                    id: true,
                    nome_completo: true,
                    crm: true,
                    crm_uf: true,
                    cpf: true,
                    especialidade: true,
                    usuario: { select: { email: true } },
                    verificacao: true
                }
            })
            return reply.send(medicos)
        } catch (error) {
            logger.error('AdminController.getPendingMedicos error', error)
            return reply.code(500).send({ error: 'Erro ao buscar médicos pendentes' })
        }
    }

    /**
     * Verifica ou recusa um médico
     */
    async verifyMedico(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { id } = request.params as { id: string }
            const { status, observacao } = request.body as { status: 'verificado' | 'recusado', observacao?: string }
            const user = request.user as AuthenticatedUser

            if (!['verificado', 'recusado'].includes(status)) {
                return reply.code(400).send({ error: 'Status inválido' })
            }

            const medico = await prisma.medico.update({
                where: { id: parseInt(id) },
                data: { verificacao: status }
            })

            // Auditoria
            await logAuditoria({
                usuarioId: user.id,
                acao: status === 'verificado' ? 'APPROVE_MEDICO' : 'REJECT_MEDICO',
                recurso: 'medico',
                recursoId: medico.id,
                detalhes: `Médico ${medico.nome_completo} ${status}. Obs: ${observacao || 'Nenhuma'}`,
                ip: request.ip,
                userAgent: request.headers['user-agent']
            })

            return reply.send({ message: `Médico ${status} com sucesso`, medico })
        } catch (error) {
            logger.error('AdminController.verifyMedico error', error)
            return reply.code(500).send({ error: 'Erro ao processar verificação' })
        }
    }

    /**
     * Retorna documento de um médico para verificação
     */
    async getMedicoDocument(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { id, type } = request.params as { id: string, type: string }
            const medicoId = parseInt(id)

            const medico = await prisma.medico.findUnique({
                where: { id: medicoId },
                select: {
                    diploma_data: true,
                    diploma_mimetype: true,
                    especializacao_data: true,
                    especializacao_mimetype: true,
                    assinatura_digital_data: true,
                    assinatura_digital_mimetype: true,
                    seguro_responsabilidade_data: true,
                    seguro_responsabilidade_mimetype: true
                }
            })

            if (!medico) {
                return reply.code(404).send({ error: 'Médico não encontrado' })
            }

            let data: Buffer | null = null
            let mimetype: string | null = null

            switch (type) {
                case 'diploma':
                    data = medico.diploma_data as any
                    mimetype = medico.diploma_mimetype
                    break
                case 'especializacao':
                    data = medico.especializacao_data as any
                    mimetype = medico.especializacao_mimetype
                    break
                case 'assinatura':
                    data = medico.assinatura_digital_data as any
                    mimetype = medico.assinatura_digital_mimetype
                    break
                case 'seguro':
                    data = medico.seguro_responsabilidade_data as any
                    mimetype = medico.seguro_responsabilidade_mimetype
                    break
                default:
                    return reply.code(400).send({ error: 'Tipo de documento inválido' })
            }

            if (!data) {
                return reply.code(404).send({ error: 'Documento não encontrado' })
            }

            // Nota: Os dados binários vêm criptografados do banco. 
            // Precisamos descriptografar antes de enviar.
            const decrypted = (decrypt as any)(data.toString('utf8'), true)

            // CFM: Auditoria de acesso a documento sensível por terceiro (Admin)
            await logAuditoria({
                usuarioId: (request.user as any).id,
                acao: 'ACCESS_MEDICO_DOCUMENT_ADMIN',
                recurso: 'MEDICO_DOC',
                recursoId: medicoId,
                detalhes: `Acesso administrativo ao documento: ${type}`,
                ip: request.ip,
                userAgent: request.headers['user-agent']
            })

            return reply.type(mimetype || 'application/pdf').send(decrypted)
        } catch (error) {
            logger.error('AdminController.getMedicoDocument error', error)
            return reply.code(500).send({ error: 'Erro ao buscar documento' })
        }
    }

    /**
     * Retorna logs de auditoria para o painel de governança
     */
    async getAuditLogs(request: FastifyRequest, reply: FastifyReply) {
        try {
            const logs = await prisma.trilhaAuditoria.findMany({
                take: 50,
                orderBy: { createdAt: 'desc' }
            })
            return reply.send(logs)
        } catch (error) {
            logger.error('AdminController.getAuditLogs error', error)
            return reply.code(500).send({ error: 'Erro ao buscar logs de auditoria' })
        }
    }
}
