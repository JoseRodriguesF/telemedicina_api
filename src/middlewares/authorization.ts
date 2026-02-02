import { FastifyRequest, FastifyReply } from 'fastify'
import { AuthenticatedUser } from '../types/shared'
import prisma from '../config/database'
import logger from '../utils/logger'

/**
 * Middleware para verificar se o usuário tem permissão para acessar uma consulta
 * Verifica se o usuário é o médico, paciente ou admin da consulta
 */
export async function authorizeConsultaAccess(
    request: FastifyRequest<{ Params: { id: string } | { consultaId: string } }>,
    reply: FastifyReply
) {
    const user = request.user as AuthenticatedUser
    if (!user) {
        return reply.code(401).send({ error: 'unauthorized', message: 'Autenticação necessária' })
    }

    // Extrair consultaId dos params (pode ser 'id' ou 'consultaId')
    const params = request.params as any
    const consultaId = Number(params.id || params.consultaId)

    if (isNaN(consultaId)) {
        return reply.code(400).send({ error: 'invalid_consulta_id', message: 'ID de consulta inválido' })
    }

    // Buscar consulta
    const consulta = await prisma.consulta.findUnique({
        where: { id: consultaId },
        select: { id: true, medicoId: true, pacienteId: true }
    })

    if (!consulta) {
        return reply.code(404).send({ error: 'consulta_not_found', message: 'Consulta não encontrada' })
    }

    // Verificar autorização
    const isAuthorized =
        (user.medicoId && user.medicoId === consulta.medicoId) ||
        (user.pacienteId && user.pacienteId === consulta.pacienteId) ||
        user.tipo_usuario === 'admin'

    if (!isAuthorized) {
        logger.warn('Tentativa de acesso não autorizado a consulta', {
            userId: user.id,
            consultaId,
            userMedicoId: user.medicoId,
            userPacienteId: user.pacienteId
        })
        return reply.code(403).send({ error: 'forbidden', message: 'Acesso negado a esta consulta' })
    }

    // Anexar consulta ao request para evitar busca duplicada
    ; (request as any).consulta = consulta
}

/**
 * Middleware para verificar se o usuário é médico verificado
 */
export async function requireVerifiedMedico(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as AuthenticatedUser
    if (!user) {
        return reply.code(401).send({ error: 'unauthorized', message: 'Autenticação necessária' })
    }

    if (user.tipo_usuario !== 'medico') {
        return reply.code(403).send({
            error: 'forbidden_only_medico',
            message: 'Apenas médicos podem acessar este recurso'
        })
    }

    const medicoId = user.medicoId
    if (!medicoId) {
        return reply.code(409).send({
            error: 'medico_record_not_found',
            message: 'Perfil de médico não encontrado'
        })
    }

    const medico = await prisma.medico.findUnique({
        where: { id: medicoId },
        select: { id: true, verificacao: true }
    })

    if (!medico || medico.verificacao !== 'verificado') {
        return reply.code(403).send({
            error: 'medico_not_verified',
            message: 'Médico não verificado. Aguarde a aprovação do seu cadastro.'
        })
    }

    // Anexar medicoId ao request
    ; (request as any).medicoId = medicoId
}

/**
 * Middleware para verificar se o usuário é paciente
 */
export async function requirePaciente(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as AuthenticatedUser
    if (!user) {
        return reply.code(401).send({ error: 'unauthorized', message: 'Autenticação necessária' })
    }

    if (user.tipo_usuario !== 'paciente') {
        return reply.code(403).send({
            error: 'forbidden_only_paciente',
            message: 'Apenas pacientes podem acessar este recurso'
        })
    }

    const pacienteId = user.pacienteId
    if (!pacienteId) {
        return reply.code(409).send({
            error: 'paciente_record_not_found',
            message: 'Perfil de paciente não encontrado'
        })
    }

    // Anexar pacienteId ao request
    ; (request as any).pacienteId = pacienteId
}

/**
 * Middleware para verificar se o usuário é admin
 */
export function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as AuthenticatedUser
    if (!user) {
        return reply.code(401).send({ error: 'unauthorized', message: 'Autenticação necessária' })
    }

    if (user.tipo_usuario !== 'admin') {
        return reply.code(403).send({
            error: 'forbidden_admin_only',
            message: 'Apenas administradores podem acessar este recurso'
        })
    }
}
