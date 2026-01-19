/**
 * Constantes de status de consulta
 * Centralizadas para evitar strings mágicas espalhadas pelo código
 */

export const CONSULTA_STATUS = {
    SCHEDULED: 'scheduled',
    SOLICITADA: 'solicitada',
    AGENDADA: 'agendada',
    IN_PROGRESS: 'in_progress',
    FINISHED: 'finished'
} as const

export type ConsultaStatusValue = typeof CONSULTA_STATUS[keyof typeof CONSULTA_STATUS]

/**
 * Status ativos (consulta pode ser acessada/reconectada)
 */
export const ACTIVE_CONSULTA_STATUSES: ConsultaStatusValue[] = [
    CONSULTA_STATUS.SCHEDULED,
    CONSULTA_STATUS.SOLICITADA,
    CONSULTA_STATUS.AGENDADA,
    CONSULTA_STATUS.IN_PROGRESS
]

/**
 * Status que permitem claim por médico
 */
export const CLAIMABLE_STATUSES: ConsultaStatusValue[] = [
    CONSULTA_STATUS.SCHEDULED,
    CONSULTA_STATUS.SOLICITADA,
    CONSULTA_STATUS.AGENDADA
]

/**
 * Status que transicionam para IN_PROGRESS ao criar sala
 */
export const TRANSITION_TO_PROGRESS_STATUSES: ConsultaStatusValue[] = [
    CONSULTA_STATUS.SCHEDULED,
    CONSULTA_STATUS.AGENDADA,
    CONSULTA_STATUS.SOLICITADA
]
