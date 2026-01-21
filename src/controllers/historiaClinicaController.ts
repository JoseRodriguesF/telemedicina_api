import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { HistoriaClinicaService } from '../services/historiaClinicaService'
import ApiError from '../utils/apiError'
import logger from '../utils/logger'

const historiaService = new HistoriaClinicaService()

// Schema de validação para criar história clínica
const criarHistoriaSchema = z.object({
    pacienteId: z.number().int().positive(),
    dados: z.object({
        queixa_principal: z.string().min(1, 'Queixa principal é obrigatória'),
        descricao_sintomas: z.string().optional(),
        historico_pessoal: z.any().optional(),
        antecedentes_familiares: z.any().optional(),
        estilo_vida: z.any().optional(),
        historico_vacinacao: z.string().optional()
    })
})

export class HistoriaClinicaController {
    /**
     * Criar nova história clínica
     * POST /historia-clinica
     */
    async criar(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { pacienteId, dados } = criarHistoriaSchema.parse(request.body)
            const usuarioId = (request as any).user.id

            const historia = await historiaService.criarHistoriaClinica(
                pacienteId,
                usuarioId,
                dados
            )

            reply.code(201).send({
                message: 'História clínica criada com sucesso',
                data: historia
            })
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                reply.code(400).send({
                    error: {
                        code: 'INVALID_INPUT',
                        message: 'Dados inválidos',
                        details: error.issues
                    }
                })
            } else if (error instanceof ApiError) {
                reply.code(error.statusCode).send({
                    error: {
                        code: error.code,
                        message: error.message,
                        details: error.details
                    }
                })
            } else {
                logger.error('Erro ao criar história clínica', error)
                reply.code(500).send({
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: 'Erro interno ao criar história clínica'
                    }
                })
            }
        }
    }

    /**
     * Buscar todas as histórias clínicas de um paciente
     * GET /historia-clinica/paciente/:pacienteId
     */
    async buscarPorPaciente(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { pacienteId } = request.params as { pacienteId: string }
            const id = parseInt(pacienteId, 10)

            if (isNaN(id)) {
                throw new ApiError('ID de paciente inválido', 400, 'INVALID_PATIENT_ID')
            }

            const historias = await historiaService.buscarHistoriaPorPaciente(id)

            reply.send({
                message: 'Histórias clínicas encontradas',
                data: historias
            })
        } catch (error: any) {
            if (error instanceof ApiError) {
                reply.code(error.statusCode).send({
                    error: {
                        code: error.code,
                        message: error.message,
                        details: error.details
                    }
                })
            } else {
                logger.error('Erro ao buscar histórias clínicas', error)
                reply.code(500).send({
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: 'Erro interno ao buscar histórias clínicas'
                    }
                })
            }
        }
    }

    /**
     * Buscar a última história clínica de um paciente
     * GET /historia-clinica/paciente/:pacienteId/ultima
     */
    async buscarUltima(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { pacienteId } = request.params as { pacienteId: string }
            const id = parseInt(pacienteId, 10)

            if (isNaN(id)) {
                throw new ApiError('ID de paciente inválido', 400, 'INVALID_PATIENT_ID')
            }

            const historia = await historiaService.buscarUltimaHistoria(id)

            if (!historia) {
                reply.code(404).send({
                    error: {
                        code: 'HISTORIA_NOT_FOUND',
                        message: 'Nenhuma história clínica encontrada para este paciente'
                    }
                })
                return
            }

            reply.send({
                message: 'História clínica encontrada',
                data: historia
            })
        } catch (error: any) {
            if (error instanceof ApiError) {
                reply.code(error.statusCode).send({
                    error: {
                        code: error.code,
                        message: error.message,
                        details: error.details
                    }
                })
            } else {
                logger.error('Erro ao buscar última história clínica', error)
                reply.code(500).send({
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: 'Erro interno ao buscar história clínica'
                    }
                })
            }
        }
    }

    /**
     * Buscar história clínica por ID
     * GET /historia-clinica/:id
     */
    async buscarPorId(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { id } = request.params as { id: string }
            const historiaId = parseInt(id, 10)

            if (isNaN(historiaId)) {
                throw new ApiError('ID inválido', 400, 'INVALID_ID')
            }

            const historia = await historiaService.buscarHistoriaPorId(historiaId)

            reply.send({
                message: 'História clínica encontrada',
                data: historia
            })
        } catch (error: any) {
            if (error instanceof ApiError) {
                reply.code(error.statusCode).send({
                    error: {
                        code: error.code,
                        message: error.message,
                        details: error.details
                    }
                })
            } else {
                logger.error('Erro ao buscar história clínica por ID', error)
                reply.code(500).send({
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: 'Erro interno ao buscar história clínica'
                    }
                })
            }
        }
    }
}
