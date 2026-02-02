import { FastifyReply, FastifyRequest } from 'fastify'
import { Rooms } from '../utils/rooms'
import { createConsulta, getConsultaById, claimConsultaByMedico, reconnectConsultaByPaciente } from '../services/consultasService'
import prisma from '../config/database'
import logger from '../utils/logger'
import { RequestWithUserId, RequestWithConsultaId, AuthenticatedUser } from '../types/shared'
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

  let where: any = {
    status: 'finished'
  }

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
        paciente: { select: { nome_completo: true } }
      }
    })

    logger.info('Histórico completo recuperado', { count: consultas.length })
    return reply.send(consultas)
  } catch (error) {
    logger.error('Erro ao buscar histórico completo', error as Error, { userId: user.id })
    return reply.code(500).send({ error: 'internal_server_error', message: 'Erro ao buscar histórico de consultas' })
  }
}
