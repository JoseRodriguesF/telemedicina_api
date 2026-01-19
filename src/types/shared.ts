import { FastifyRequest } from 'fastify'

/**
 * Tipos para requests com params
 */
export type RequestWithNumericId = FastifyRequest<{ Params: { id: string } }>
export type RequestWithConsultaId = FastifyRequest<{ Params: { consultaId: string } }>

/**
 * Tipos para query strings
 */
export type RequestWithUserId = FastifyRequest<{ Querystring: { userId?: string } }>

/**
 * Tipos para bodies comuns
 */
export interface AgendarConsultaBody {
    medico_id?: number | null
    paciente_id: number
    data_consulta?: string
    hora_inicio?: string
    hora_fim?: string
}

export interface JoinRoomBody {
    userId: string | number
    role?: 'medico' | 'paciente'
}

/**
 * Status de consulta
 */
export type ConsultaStatus = 'scheduled' | 'agendada' | 'in_progress' | 'finished' | 'solicitada'

/**
 * Tipos de usuário
 */
export type TipoUsuario = 'paciente' | 'medico' | 'admin'

/**
 * Interface para o usuário autenticado (adicionado ao request)
 */
export interface AuthenticatedUser {
    id: number
    email: string
    tipo_usuario: TipoUsuario
}

/**
 * Resultado padrão de operações de serviço
 */
export interface ServiceResult<T = any> {
    ok: boolean
    data?: T
    error?: string
    message?: string
}

/**
 * Item da fila (não usado atualmente, mas mantido para referência)
 */
export interface FilaItem {
    consultaId: number
    pacienteId: number
    roomId: string
    createdAt: number
    status: 'scheduled' | 'in_progress'
}
