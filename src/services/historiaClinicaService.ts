import prisma from '../config/database'
import ApiError from '../utils/apiError'
import logger from '../utils/logger'

export interface DadosHistoriaClinica {
    queixa_principal: string
    descricao_sintomas?: string
    historico_pessoal?: any
    antecedentes_familiares?: any
    estilo_vida?: any
    historico_vacinacao?: string
}

export class HistoriaClinicaService {
    /**
     * Cria uma nova história clínica a partir dos dados da triagem
     */
    async criarHistoriaClinica(
        pacienteId: number,
        usuarioId: number,
        dados: DadosHistoriaClinica
    ) {
        try {
            // Verificar se o paciente existe
            const paciente = await prisma.paciente.findUnique({
                where: { id: pacienteId }
            })

            if (!paciente) {
                throw new ApiError('Paciente não encontrado', 404, 'PATIENT_NOT_FOUND')
            }

            // Obter a próxima versão para este paciente
            const ultimaVersao = await prisma.historiaClinica.findFirst({
                where: { pacienteId },
                orderBy: { versao: 'desc' },
                select: { versao: true }
            })

            const proximaVersao = ultimaVersao ? ultimaVersao.versao + 1 : 1

            // Criar nova história clínica
            const historiaClinica = await prisma.historiaClinica.create({
                data: {
                    pacienteId,
                    queixaPrincipal: dados.queixa_principal,
                    descricaoSintomas: dados.descricao_sintomas || null,
                    historicoPessoal: dados.historico_pessoal || {},
                    antecedentesFamiliares: dados.antecedentes_familiares || {},
                    estiloVida: dados.estilo_vida || {},
                    historicoVacinacao: dados.historico_vacinacao || null,
                    status: 'completo',
                    criadoPor: usuarioId,
                    atualizadoPor: usuarioId,
                    dataConsulta: new Date(),
                    versao: proximaVersao
                }
            })

            logger.info(`História clínica criada com sucesso`, {
                historiaClinicaId: historiaClinica.id,
                pacienteId,
                versao: proximaVersao
            })

            return historiaClinica
        } catch (error) {
            if (error instanceof ApiError) throw error
            logger.error('Erro ao criar história clínica', error as Error, { pacienteId })
            throw new ApiError('Erro ao salvar história clínica', 500, 'CREATE_HISTORIA_ERROR')
        }
    }

    /**
     * Busca todas as histórias clínicas de um paciente
     */
    async buscarHistoriaPorPaciente(pacienteId: number) {
        try {
            const historias = await prisma.historiaClinica.findMany({
                where: { pacienteId },
                orderBy: { versao: 'desc' },
                include: {
                    paciente: {
                        select: {
                            id: true,
                            nome_completo: true
                        }
                    },
                    usuarioCriador: {
                        select: {
                            id: true,
                            email: true
                        }
                    }
                }
            })

            return historias
        } catch (error) {
            logger.error('Erro ao buscar história clínica', error as Error, { pacienteId })
            throw new ApiError('Erro ao buscar história clínica', 500, 'FETCH_HISTORIA_ERROR')
        }
    }

    /**
     * Busca a última versão da história clínica de um paciente
     */
    async buscarUltimaHistoria(pacienteId: number) {
        try {
            const historia = await prisma.historiaClinica.findFirst({
                where: { pacienteId },
                orderBy: { versao: 'desc' },
                include: {
                    paciente: {
                        select: {
                            id: true,
                            nome_completo: true
                        }
                    }
                }
            })

            return historia
        } catch (error) {
            logger.error('Erro ao buscar última história clínica', error as Error, { pacienteId })
            throw new ApiError('Erro ao buscar história clínica', 500, 'FETCH_HISTORIA_ERROR')
        }
    }

    /**
     * Busca uma história clínica específica por ID
     */
    async buscarHistoriaPorId(id: number) {
        try {
            const historia = await prisma.historiaClinica.findUnique({
                where: { id },
                include: {
                    paciente: {
                        select: {
                            id: true,
                            nome_completo: true,
                            data_nascimento: true,
                            sexo: true
                        }
                    },
                    usuarioCriador: {
                        select: {
                            id: true,
                            email: true,
                            tipo_usuario: true
                        }
                    }
                }
            })

            if (!historia) {
                throw new ApiError('História clínica não encontrada', 404, 'HISTORIA_NOT_FOUND')
            }

            return historia
        } catch (error) {
            if (error instanceof ApiError) throw error
            logger.error('Erro ao buscar história clínica por ID', error as Error, { id })
            throw new ApiError('Erro ao buscar história clínica', 500, 'FETCH_HISTORIA_ERROR')
        }
    }
}
