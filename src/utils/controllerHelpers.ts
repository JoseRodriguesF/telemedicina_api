import { FastifyReply } from 'fastify'

/**
 * Helper para obter ICE servers com fallback automático
 */
export async function getIceServersWithFallback(): Promise<any[]> {
    const { getIceServersFromEnv, getIceServersFromXirsys } = await import('../services/iceServers')

    let iceServers: any[] | null = getIceServersFromEnv()
    if (!iceServers) iceServers = await getIceServersFromXirsys()
    if (!iceServers) iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]

    return iceServers
}

/**
 * Helper para resolver usuario_id para pacienteId e/ou medicoId
 */
export async function resolveUserProfiles(userId: number) {
    const prisma = (await import('../config/database')).default

    const [paciente, medico] = await Promise.all([
        prisma.paciente.findUnique({ where: { usuario_id: userId }, select: { id: true } }),
        prisma.medico.findUnique({ where: { usuario_id: userId }, select: { id: true } })
    ])

    return {
        pacienteId: paciente?.id || null,
        medicoId: medico?.id || null,
        hasPaciente: !!paciente,
        hasMedico: !!medico
    }
}

/**
 * Helper para gerar condições OR do Prisma baseadas em perfis
 */
export function buildUserProfileConditions(pacienteId: number | null, medicoId: number | null) {
    const orConditions: any[] = []
    if (pacienteId) orConditions.push({ pacienteId })
    if (medicoId) orConditions.push({ medicoId })
    return orConditions
}

/**
 * Valida se um ID numérico é válido
 */
export function validateNumericId(id: any, fieldName = 'id'): { valid: boolean; numericId?: number; error?: object } {
    const numericId = Number(id)
    if (Number.isNaN(numericId)) {
        return {
            valid: false,
            error: { error: `invalid_${fieldName}`, message: `${fieldName} must be a valid number` }
        }
    }
    return { valid: true, numericId }
}

/**
 * Valida se uma data é válida
 */
export function validateDate(dateString: any): { valid: boolean; error?: object } {
    if (!dateString) return { valid: true } // Data opcional

    const parsedDate = new Date(dateString)
    if (isNaN(parsedDate.getTime())) {
        return {
            valid: false,
            error: {
                error: 'invalid_date',
                message: 'Data inválida',
                received: dateString,
                expected_format: 'ISO 8601 (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss.sssZ)'
            }
        }
    }
    return { valid: true }
}

/**
 * Respostas padronizadas para erros comuns
 */
export const standardErrors = {
    unauthorized: () => ({ error: 'unauthorized', message: 'Authentication required' }),
    forbidden: () => ({ error: 'forbidden', message: 'Access denied' }),
    notFound: (resource = 'Resource') => ({ error: 'not_found', message: `${resource} not found` }),
    invalidInput: (field: string) => ({ error: 'invalid_input', message: `Invalid ${field}` }),
}

/**
 * Helper para enviar resposta de erro com código HTTP
 */
export function sendError(reply: FastifyReply, statusCode: number, error: object) {
    return reply.code(statusCode).send(error)
}
