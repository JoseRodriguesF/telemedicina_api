import { FastifyReply, FastifyRequest } from 'fastify'
import { getConsultaById, updateConsultaStatus, createConsulta } from '../services/consultasService'
import { Rooms } from '../utils/rooms'
import prisma from '../config/database'
import logger from '../utils/logger'
import {
  getIceServersWithFallback,
  resolveUserProfiles,
  buildUserProfileConditions,
  validateNumericId,
  validateDate
} from '../utils/controllerHelpers'
import {
  RequestWithNumericId,
  AuthenticatedUser,
  AgendarConsultaBody,
  JoinRoomBody,
  RequestWithUserId
} from '../types/shared'

export async function createOrGetRoom(req: RequestWithNumericId, reply: FastifyReply) {
  const validation = validateNumericId(req.params.id, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const id = validation.numericId!
  const consulta = await getConsultaById(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user = req.user as AuthenticatedUser
  if (!user || (user.id !== consulta.medicoId && user.id !== consulta.pacienteId)) {
    return reply.code(403).send({ error: 'forbidden' })
  }

  const { roomId, created } = Rooms.createOrGet(id)
  const iceServers = await getIceServersWithFallback()

  if (created && consulta.status === 'scheduled') {
    await updateConsultaStatus(id, 'in_progress')
  }

  return reply.send({ roomId, iceServers })
}

export async function listParticipants(req: RequestWithNumericId, reply: FastifyReply) {
  const validation = validateNumericId(req.params.id, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const id = validation.numericId!
  const consulta = await getConsultaById(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user = req.user as AuthenticatedUser
  if (!user || (user.id !== consulta.medicoId && user.id !== consulta.pacienteId)) {
    return reply.code(403).send({ error: 'forbidden' })
  }

  let roomId: string | undefined = Rooms.findRoomIdByConsulta(id)
  if (!roomId) roomId = Rooms.createOrGet(id).roomId

  const participants = Rooms.listParticipants(roomId!)
  return reply.send({ roomId, participants })
}

export async function endConsulta(req: RequestWithNumericId, reply: FastifyReply) {
  const validation = validateNumericId(req.params.id, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const id = validation.numericId!
  const consulta = await getConsultaById(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user = req.user as AuthenticatedUser
  if (!user || (user.id !== consulta.medicoId && user.id !== consulta.pacienteId)) {
    return reply.code(403).send({ error: 'forbidden' })
  }

  const { roomId } = Rooms.createOrGet(id)
  Rooms.end(roomId)

  await updateConsultaStatus(id, 'finished')
  return reply.send({ ok: true })
}

export async function joinRoom(
  req: FastifyRequest<{ Params: { id: string }; Body: JoinRoomBody }>,
  reply: FastifyReply
) {
  const validation = validateNumericId(req.params.id, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const id = validation.numericId!
  const consulta = await getConsultaById(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user = req.user as AuthenticatedUser
  if (!user || (user.id !== consulta.medicoId && user.id !== consulta.pacienteId)) {
    return reply.code(403).send({ error: 'forbidden' })
  }

  const { roomId } = Rooms.createOrGet(id)
  const res = Rooms.addParticipant(roomId, {
    userId: req.body.userId,
    role: req.body.role
  })

  if (!res.ok) return reply.code(409).send({ error: res.reason })

  return reply.send({ roomId, participants: Rooms.listParticipants(roomId) })
}

export async function createRoomSimple(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as AuthenticatedUser
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  const { roomId } = Rooms.createStandalone()
  const iceServers = await getIceServersWithFallback()

  return reply.send({ roomId, iceServers })
}

export async function agendarConsulta(
  req: FastifyRequest<{ Body: AgendarConsultaBody }>,
  reply: FastifyReply
) {
  const user = req.user as AuthenticatedUser
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  const { medico_id, paciente_id, data_consulta, hora_inicio, hora_fim } = req.body

  const validation = validateNumericId(paciente_id, 'paciente_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const pacienteId = validation.numericId!
  const medicoId = medico_id === undefined ? null : Number(medico_id)

  // Validar data
  const dateValidation = validateDate(data_consulta)
  if (!dateValidation.valid) return reply.code(400).send(dateValidation.error!)

  // Autorização: paciente pode agendar para si
  if (user.tipo_usuario === 'paciente') {
    const { pacienteId: userPacienteId } = await resolveUserProfiles(user.id)
    if (!userPacienteId || userPacienteId !== pacienteId) {
      return reply.code(403).send({ error: 'forbidden' })
    }
  }

  try {
    const consulta = await createConsulta({
      medicoId,
      pacienteId,
      status: 'agendada',
      data_consulta,
      hora_inicio,
      hora_fim
    })
    return reply.send({ ok: true, consulta })
  } catch (err: any) {
    logger.error('Failed to schedule consultation', err, {
      userId: user.id,
      pacienteId,
      medicoId
    })
    return reply.code(500).send({ error: 'internal_error', details: err.message })
  }
}

export async function listConsultasAgendadas(req: RequestWithUserId, reply: FastifyReply) {
  const user = req.user as AuthenticatedUser
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  const { userId } = req.query
  const where: any = { status: 'agendada' }

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
  } else if (user.tipo_usuario === 'medico') {
    const { medicoId } = await resolveUserProfiles(user.id)
    if (!medicoId) return reply.send([])
    where.medicoId = medicoId
  }

  const consultas = await prisma.consulta.findMany({
    where,
    orderBy: { data_consulta: 'asc' },
    include: {
      medico: { select: { id: true, nome_completo: true } },
      paciente: { select: { id: true, nome_completo: true } }
    }
  })

  return reply.send(consultas)
}

export async function listMedicos(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as AuthenticatedUser
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  const medicos = await prisma.medico.findMany({
    select: { id: true, nome_completo: true }
  })

  return reply.send(medicos)
}
