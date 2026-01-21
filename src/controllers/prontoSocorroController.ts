import { FastifyReply, FastifyRequest } from 'fastify'
import { Rooms } from '../utils/rooms'
import { createConsulta, getConsultaById, claimConsultaByMedico, reconnectConsultaByPaciente } from '../services/consultasService'
import prisma from '../config/database'
import {
  getIceServersWithFallback,
  resolveUserProfiles,
  buildUserProfileConditions,
  validateNumericId
} from '../utils/controllerHelpers'
import { RequestWithUserId, RequestWithConsultaId, AuthenticatedUser } from '../types/shared'

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

    const { pacienteId, medicoId } = await resolveUserProfiles(validation.numericId!)
    const orConditions = buildUserProfileConditions(pacienteId, medicoId)

    if (orConditions.length === 0) return reply.send([])
    where.OR = orConditions
  } else if (user.tipo_usuario === 'paciente') {
    const { pacienteId } = await resolveUserProfiles(user.id)
    if (!pacienteId) return reply.send([])
    where.pacienteId = pacienteId
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

  const { pacienteId } = await resolveUserProfiles(user.id)
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
      status: 'scheduled'
    })
  }

  const { roomId } = Rooms.createOrGet(consulta.id)
  const iceServers = await getIceServersWithFallback()

  const { historiaClinicaId } = req.body as { historiaClinicaId?: number }
  if (historiaClinicaId) {
    try {
      await prisma.historiaClinica.updateMany({
        where: { id: historiaClinicaId, pacienteId },
        data: { consultaId: consulta.id }
      })
    } catch (error) {
      console.error('Erro ao vincular história clínica à consulta:', error)
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

  const consultas = await prisma.consulta.findMany({
    where: { status: 'scheduled', medicoId: null },
    select: { id: true, pacienteId: true }
  })

  const items = consultas.map(c => {
    const { roomId } = Rooms.createOrGet(c.id)
    return {
      consultaId: c.id,
      pacienteId: c.pacienteId,
      roomId,
      createdAt: Date.now(),
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
    const { medicoId } = await resolveUserProfiles(user.id)
    if (!medicoId) {
      return reply.code(409).send({ error: 'medico_record_not_found_for_usuario' })
    }
    result = await claimConsultaByMedico(consultaId, medicoId)
  } else if (user.tipo_usuario === 'paciente') {
    const { pacienteId } = await resolveUserProfiles(user.id)
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

  const { pacienteId, medicoId } = await resolveUserProfiles(user.id)

  if (!pacienteId && !medicoId) return reply.send([])

  const orConditions = buildUserProfileConditions(pacienteId, medicoId)

  const consultas = await prisma.consulta.findMany({
    where: {
      status: { in: ['in_progress', 'finished'] },
      OR: orConditions
    },
    orderBy: { createdAt: 'desc' },
    include: {
      medico: { select: { nome_completo: true } },
      paciente: { select: { nome_completo: true } }
    }
  })

  return reply.send(consultas)
}
