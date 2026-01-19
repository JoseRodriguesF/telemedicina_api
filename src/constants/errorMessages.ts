/**
 * Mensagens de erro padronizadas da API
 * Centralizadas para consistência e manutenibilidade
 */

export const ERROR_MESSAGES = {
    // Autenticação
    UNAUTHORIZED: 'unauthorized',
    FORBIDDEN: 'forbidden',
    SESSION_EXPIRED: 'session_expired',

    // Consultas
    CONSULTA_NOT_FOUND: 'consulta_not_found',
    CONSULTA_ALREADY_CLAIMED: 'already_claimed_or_in_progress',
    CANNOT_CANCEL_FINISHED: 'cannot_cancel_finished_consultation',
    INVALID_STATUS_TRANSITION: 'invalid_status_transition',

    // Usuários
    USER_NOT_FOUND: 'user_not_found',
    PACIENTE_RECORD_NOT_FOUND: 'paciente_record_not_found_for_usuario',
    MEDICO_RECORD_NOT_FOUND: 'medico_record_not_found_for_usuario',

    // Permissões
    ONLY_PACIENTE_CAN_CREATE: 'forbidden_only_paciente_can_create_room',
    ONLY_MEDICO_CAN_LIST_QUEUE: 'forbidden_only_medico_can_list_queue',
    NOT_AUTHORIZED_TO_RECONNECT: 'not_authorized_to_reconnect',

    // Validação
    INVALID_ID: 'invalid_id_format',
    INVALID_DATE: 'invalid_date_format',
    INVALID_CPF: 'invalid_cpf_format',

    // Genérico
    INTERNAL_ERROR: 'internal_error'
} as const

export const ERROR_DESCRIPTIONS = {
    [ERROR_MESSAGES.CONSULTA_NOT_FOUND]: 'Consulta não encontrada',
    [ERROR_MESSAGES.CANNOT_CANCEL_FINISHED]: 'Não é possível cancelar consultas finalizadas',
    [ERROR_MESSAGES.INVALID_STATUS_TRANSITION]: 'Apenas consultas com status solicitado podem ser confirmadas',
    [ERROR_MESSAGES.UNAUTHORIZED]: 'Não autorizado',
    [ERROR_MESSAGES.FORBIDDEN]: 'Acesso negado'
} as const
