import { FastifyReply, FastifyRequest } from 'fastify'
import { Rooms } from '../utils/rooms'
import { createConsulta, getConsultaById, claimConsultaByMedico, reconnectConsultaByPaciente } from '../services/consultasService'
import prisma from '../config/database'
import logger from '../utils/logger'
import { RequestWithUserId, RequestWithConsultaId, AuthenticatedUser } from '../types/shared'
import { decrypt } from '../utils/encryption'
import {
  getIceServersWithFallback,
  validateNumericId
} from '../utils/controllerHelpers'

export async function listarSalasEmAndamento(req: RequestWithUserId, reply: FastifyReply) {
  const user = req.user as AuthenticatedUser
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  if (!['medico', 'admin', 'paciente'].includes(user.tipo_usuario)) {
    return reply.code(403).send({ error: 'forbidden' })
  }

  const { userId } = req.query
  const where: any = { status: 'in_progress' }

  if (userId) {
    const validation = validateNumericId(userId, 'user_id')
    if (!validation.valid) return reply.code(400).send(validation.error!)

    // For other users, we'd still need to check profiles, but let's assume it's current user mostly
    // or just filter for the target user's profiles
    const target = await prisma.usuario.findUnique({
      where: { id: validation.numericId },
      include: { paciente: true, medico: true }
    })
    if (!target) return reply.send([])
    const orConditions: any[] = []
    if (target.paciente) orConditions.push({ pacienteId: target.paciente.id })
    if (target.medico) orConditions.push({ medicoId: target.medico.id })
    if (orConditions.length === 0) return reply.send([])
    where.OR = orConditions
  } else if (user.tipo_usuario === 'paciente') {
    if (!user.pacienteId) return reply.send([])
    where.pacienteId = user.pacienteId
  }

  const consultas = await prisma.consulta.findMany({
    where,
    select: { id: true, pacienteId: true, medicoId: true }
  })

  const items = consultas.map(c => {
    const { roomId } = Rooms.createOrGet(c.id)
    return {
      consultaId: c.id,
      pacienteId: c.pacienteId,
      medicoId: c.medicoId,
      roomId,
      createdAt: Date.now(),
      status: 'in_progress' as const
    }
  })

  return reply.send(items)
}

export async function criarSalaConsulta(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as AuthenticatedUser
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  if (user.tipo_usuario !== 'paciente') {
    return reply.code(403).send({ error: 'forbidden_only_paciente_can_create_room' })
  }

  const pacienteId = user.pacienteId
  if (!pacienteId) {
    return reply.code(409).send({ error: 'paciente_record_not_found_for_usuario' })
  }

  // Verificar se já existe uma consulta ativa (para permitir reconexão)
  let consulta = await prisma.consulta.findFirst({
    where: {
      pacienteId,
      status: { in: ['scheduled', 'in_progress'] }
    },
    orderBy: { id: 'desc' }
  })

  if (!consulta) {
    consulta = await createConsulta({
      medicoId: null as any,
      pacienteId,
      status: 'scheduled',
      data_consulta: new Date()
    })
  }

  const { roomId } = Rooms.createOrGet(consulta.id)
  const iceServers = await getIceServersWithFallback()

  const { historiaClinicaId } = (req.body ?? {}) as { historiaClinicaId?: number }
  if (historiaClinicaId) {
    try {
      await prisma.historiaClinica.updateMany({
        where: { id: historiaClinicaId, pacienteId },
        data: { consultaId: consulta.id }
      })
    } catch (error) {
      logger.error('Erro ao vincular história clínica à consulta', error as Error, { historiaClinicaId, consultaId: consulta.id })
      // Não falhar a requisição principal
    }
  }

  return reply.send({ roomId, consultaId: consulta.id, iceServers })
}

export async function listarFila(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as AuthenticatedUser
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  if (user.tipo_usuario !== 'medico') {
    return reply.code(403).send({ error: 'forbidden_only_medico_can_list_queue' })
  }

  const medicoId = user.medicoId
  if (!medicoId) {
    return reply.code(409).send({ error: 'medico_record_not_found_for_usuario' })
  }

  const medico = await prisma.medico.findUnique({ where: { id: medicoId } })
  if (medico?.verificacao !== 'verificado') {
    return reply.code(403).send({ error: 'medico_not_verified' })
  }

  const consultas = await prisma.consulta.findMany({
    where: { status: 'scheduled', medicoId: null },
    select: {
      id: true,
      pacienteId: true,
      createdAt: true,
      paciente: {
        select: { nome_completo: true }
      },
      historiaClinica: true
    }
  })

  const items = consultas.map(c => {
    const { roomId } = Rooms.createOrGet(c.id)
    return {
      consultaId: c.id,
      pacienteId: c.pacienteId,
      pacienteNome: c.paciente.nome_completo,
      historiaClinica: c.historiaClinica,
      roomId,
      createdAt: c.createdAt,
      status: 'scheduled' as const
    }
  })

  return reply.send(items)
}

export async function claimConsulta(req: RequestWithConsultaId, reply: FastifyReply) {
  const user = req.user as AuthenticatedUser
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  const validation = validateNumericId(req.params.consultaId, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const consultaId = validation.numericId!
  const consulta = await getConsultaById(consultaId)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  let result: any

  if (user.tipo_usuario === 'medico') {
    const medicoId = user.medicoId
    if (!medicoId) {
      return reply.code(409).send({ error: 'medico_record_not_found_for_usuario' })
    }
    const medico = await prisma.medico.findUnique({ where: { id: medicoId } })
    if (medico?.verificacao !== 'verificado') {
      return reply.code(403).send({ error: 'medico_not_verified' })
    }
    result = await claimConsultaByMedico(consultaId, medicoId)
  } else if (user.tipo_usuario === 'paciente') {
    const pacienteId = user.pacienteId
    if (!pacienteId) {
      return reply.code(409).send({ error: 'paciente_record_not_found_for_usuario' })
    }
    result = await reconnectConsultaByPaciente(consultaId, pacienteId)
  } else {
    return reply.code(403).send({ error: 'forbidden' })
  }

  if (!result.ok) return reply.code(409).send({ error: result.error })

  const { roomId } = Rooms.createOrGet(consultaId)
  const iceServers = await getIceServersWithFallback()

  return reply.send({ roomId, consultaId, iceServers })
}

export async function getHistoricoCompleto(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as AuthenticatedUser
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  logger.info('getHistoricoCompleto chamado', { userId: user.id, tipoUsuario: user.tipo_usuario, query: req.query })

  // Resolve os perfis vinculados ao usuário logado
  const { pacienteId: profilePacienteId, medicoId: profileMedicoId } = user
  const { pacienteId: queryPacienteId } = req.query as { pacienteId?: string }

  let where: any = {}

  // Se foi fornecido um pacienteId na query, buscamos o histórico daquele paciente específico
  if (queryPacienteId) {
    const validation = validateNumericId(queryPacienteId, 'pacienteId')
    if (!validation.valid) return reply.code(400).send(validation.error!)
    const targetPacienteId = validation.numericId!

    // Verificação de permissão: Médicos/Admins podem ver qualquer histórico de paciente.
    // O próprio paciente também pode ver seu histórico.
    const canAccessAll = user.tipo_usuario === 'medico' || user.tipo_usuario === 'admin'
    const isSelf = profilePacienteId === targetPacienteId

    if (canAccessAll || isSelf) {
      logger.debug('Aplicando filtro de pacienteId', { targetPacienteId })
      where.pacienteId = targetPacienteId
    } else {
      logger.warn('Tentativa de acesso não autorizada ao histórico', { userId: user.id, targetPacienteId })
      return reply.code(403).send({ error: 'forbidden', message: 'Você não tem permissão para visualizar este histórico de paciente.' })
    }
  } else {
    // Comportamento original/geral: retorna o histórico do usuário logado (seja médico ou paciente)
    if (!profilePacienteId && !profileMedicoId) {
      logger.debug('Usuário sem perfil de paciente ou médico', { userId: user.id })
      return reply.send([])
    }

    // Constrói condições OR para filtrar por pacienteId OU medicoId do usuário logado
    const orConditions: any[] = []
    if (profilePacienteId) orConditions.push({ pacienteId: profilePacienteId })
    if (profileMedicoId) orConditions.push({ medicoId: profileMedicoId })
    where.OR = orConditions
  }

  try {
    const consultas = await prisma.consulta.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        medico: { select: { nome_completo: true } },
        paciente: { select: { nome_completo: true, cpf: true } },
        prescricoes: true,
        historiaClinica: true
      }
    })

    // Mapeia o campo 'resumo' para 'resumo_consulta' (exclusivo para médicos)
    // O paciente nunca deve visualizar o resumo interno do médico
    const isMedico = user.tipo_usuario === 'medico'
    const result = consultas.map(c => {
      const { resumo, ...rest } = c as any
      const decryptedResumo = resumo ? (() => { try { return decrypt(resumo) } catch { return null } })() : null
      return isMedico
        ? { ...rest, resumo_consulta: decryptedResumo ?? null }
        : { ...rest, resumo_consulta: undefined }
    })

    logger.info('Histórico completo recuperado', { count: consultas.length })
    return reply.send(result)
  } catch (error) {
    logger.error('Erro ao buscar histórico completo', error as Error, { userId: user.id })
    return reply.code(500).send({ error: 'internal_server_error', message: 'Erro ao buscar histórico de consultas' })
  }
}

/**
 * Busca consultas no histórico por nome (médico ou paciente)
 * GET /ps/historico-completo/search?q=<termo>
 */
export async function searchHistoricoCompleto(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as AuthenticatedUser
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  const { q, type } = req.query as { q?: string; type?: string }

  logger.info('searchHistoricoCompleto chamado', {
    userId: user.id,
    tipoUsuario: user.tipo_usuario,
    searchTerm: q
  })

  // Validação do parâmetro de busca
  if (!q || typeof q !== 'string' || q.trim() === '') {
    logger.warn('Parâmetro de busca inválido ou vazio', { userId: user.id })
    return reply.code(400).send({
      error: 'bad_request',
      message: 'Parâmetro de busca "q" é obrigatório'
    })
  }

  const searchTerm = q.trim()
  const { pacienteId: profilePacienteId, medicoId: profileMedicoId } = user

  // Verificar se o usuário tem perfil
  if (!profilePacienteId && !profileMedicoId) {
    logger.debug('Usuário sem perfil de paciente ou médico', { userId: user.id })
    return reply.send([])
  }

  // Construir query baseada no tipo de usuário
  let where: any = {}

  if (user.tipo_usuario === 'paciente' && profilePacienteId) {
    // Paciente busca por nome do médico (aproximada por partes)
    const nameParts = searchTerm.split(' ').filter(part => part.length > 0)
    where.pacienteId = profilePacienteId
    where.medico = {
      AND: nameParts.map(part => ({
        nome_completo: {
          contains: part,
          mode: 'insensitive' as const
        }
      }))
    }
    logger.debug('Busca de paciente por médico (partes)', {
      pacienteId: profilePacienteId,
      searchTerm
    })
  } else if (user.tipo_usuario === 'medico' && profileMedicoId) {
    // Médico busca por nome OU CPF do paciente
    where.medicoId = profileMedicoId

    if (type === 'cpf') {
      // Busca precisa por CPF se solicitado explicitamente (Front-end envia type=cpf)
      where.paciente = {
        cpf: searchTerm.replace(/\D/g, '')
      }
      logger.info('Busca precisa de médico por CPF do paciente', {
        medicoId: profileMedicoId,
        searchTerm: where.paciente.cpf
      })
    } else {
      // Busca aproximada por partes do nome do paciente
      const nameParts = searchTerm.split(' ').filter(part => part.length > 0)
      where.paciente = {
        AND: nameParts.map(part => ({
          nome_completo: {
            contains: part,
            mode: 'insensitive' as const
          }
        }))
      }
      logger.debug('Busca de médico por paciente (partes do nome)', {
        medicoId: profileMedicoId,
        searchTerm
      })
    }
  } else {
    // Tipo de usuário inválido ou sem permissão
    logger.warn('Tipo de usuário inválido para busca', {
      userId: user.id,
      tipoUsuario: user.tipo_usuario
    })
    return reply.code(403).send({
      error: 'forbidden',
      message: 'Tipo de usuário inválido para realizar buscas'
    })
  }

  try {
    const consultas = await prisma.consulta.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        medico: { select: { nome_completo: true } },
        paciente: { select: { nome_completo: true, cpf: true } },
        prescricoes: true
      }
    })

    // Campo resumo é exclusivo para médicos
    const isMedico = user.tipo_usuario === 'medico'
    const result = consultas.map(c => {
      const { resumo, ...rest } = c as any
      const decryptedResumo = resumo ? (() => { try { return decrypt(resumo) } catch { return null } })() : null
      return isMedico
        ? { ...rest, resumo_consulta: decryptedResumo ?? null }
        : { ...rest, resumo_consulta: undefined }
    })

    logger.info('Busca de histórico concluída', {
      count: consultas.length,
      searchTerm,
      userId: user.id
    })

    return reply.send(result)
  } catch (error) {
    logger.error('Erro ao buscar consultas', error as Error, {
      userId: user.id,
      searchTerm
    })
    return reply.code(500).send({
      error: 'internal_server_error',
      message: 'Erro ao buscar consultas'
    })
  }
}

/**
 * Cancela automaticamente consultas expiradas
 * POST /ps/auto-cancel
 * Endpoint para executar manualmente ou via Cron
 */
export async function autoCancelExpiredConsultas(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as AuthenticatedUser

  // Apenas admin pode executar este endpoint
  if (user && user.tipo_usuario !== 'admin') {
    logger.warn('Tentativa não autorizada de executar auto-cancelamento', { userId: user.id })
    return reply.code(403).send({ error: 'forbidden', message: 'Apenas administradores podem executar esta ação' })
  }

  const startTime = Date.now()
  const now = new Date()

  logger.info('🔄 Iniciando cancelamento automático de consultas...')

  try {
    // Configurações (podem ser sobrescritas por variáveis de ambiente)
    const HOURS_BEFORE_CANCEL = parseInt(process.env.HOURS_BEFORE_AUTO_CANCEL_AGENDADA || '2')

    // ========================================
    // 1. CANCELAR CONSULTAS AGENDADAS EXPIRADAS
    // ========================================

    const hoursAgo = new Date(now.getTime() - HOURS_BEFORE_CANCEL * 60 * 60 * 1000)

    logger.info(`Buscando consultas agendadas expiradas (anteriores a ${hoursAgo.toISOString()})...`)

    const expiredAgendadas = await prisma.consulta.findMany({
      where: {
        status: 'agendada',
        hora_inicio: {
          lt: hoursAgo
        }
      },
      include: {
        medico: { select: { id: true, nome_completo: true } },
        paciente: { select: { id: true, nome_completo: true } }
      }
    })

    logger.info(`✓ Encontradas ${expiredAgendadas.length} consultas agendadas expiradas`)

    let agendadasCancelledCount = 0

    for (const consulta of expiredAgendadas) {
      try {
        await prisma.consulta.update({
          where: { id: consulta.id },
          data: {
            status: 'cancelled',
            updatedAt: now
          }
        })

        agendadasCancelledCount++

        logger.info(`✓ Consulta #${consulta.id} cancelada (agendada expirada)`, {
          consulta_id: consulta.id,
          medico: consulta.medico?.nome_completo || 'Não atribuído',
          paciente: consulta.paciente?.nome_completo,
          hora_inicio: consulta.hora_inicio,
          motivo: `Passou mais de ${HOURS_BEFORE_CANCEL} horas do horário agendado`
        })
      } catch (error) {
        logger.error(`Erro ao cancelar consulta #${consulta.id}`, error as Error)
      }
    }

    // ========================================
    // 2. CANCELAR CONSULTAS SOLICITADAS NÃO ACEITAS
    // ========================================

    const today = now.toISOString().split('T')[0] // YYYY-MM-DD

    logger.info(`Buscando consultas solicitadas não aceitas (data anterior a ${today})...`)

    const expiredSolicitadas = await prisma.consulta.findMany({
      where: {
        status: 'solicitada',
        data_consulta: {
          lt: today
        }
      },
      include: {
        medico: { select: { id: true, nome_completo: true } },
        paciente: { select: { id: true, nome_completo: true } }
      }
    })

    logger.info(`✓ Encontradas ${expiredSolicitadas.length} consultas solicitadas não aceitas`)

    let solicitadasCancelledCount = 0

    for (const consulta of expiredSolicitadas) {
      try {
        await prisma.consulta.update({
          where: { id: consulta.id },
          data: {
            status: 'cancelled',
            updatedAt: now
          }
        })

        solicitadasCancelledCount++

        logger.info(`✓ Consulta #${consulta.id} cancelada (solicitada não aceita)`, {
          consulta_id: consulta.id,
          medico: consulta.medico?.nome_completo || 'Não atribuído',
          paciente: consulta.paciente?.nome_completo,
          data_consulta: consulta.data_consulta,
          motivo: 'Não foi aceita até o dia do agendamento'
        })
      } catch (error) {
        logger.error(`Erro ao cancelar consulta #${consulta.id}`, error as Error)
      }
    }

    // ========================================
    // 3. RESUMO
    // ========================================

    const totalCancelled = agendadasCancelledCount + solicitadasCancelledCount
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    logger.info('✅ Cancelamento automático concluído', {
      totalCancelled,
      agendadasCancelled: agendadasCancelledCount,
      solicitadasCancelled: solicitadasCancelledCount,
      duration: `${duration}s`
    })

    return reply.send({
      success: true,
      message: 'Cancelamento automático executado com sucesso',
      totalCancelled,
      agendadasCancelled: agendadasCancelledCount,
      solicitadasCancelled: solicitadasCancelledCount,
      duration: parseFloat(duration),
      timestamp: now.toISOString()
    })

  } catch (error) {
    logger.error('❌ Erro no cancelamento automático', error as Error)
    return reply.code(500).send({
      error: 'internal_server_error',
      message: 'Erro ao executar cancelamento automático',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
}
