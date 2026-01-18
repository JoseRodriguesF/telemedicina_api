import { FastifyReply, FastifyRequest } from 'fastify'
import { getConsultaById, updateConsultaStatus, createConsulta } from '../services/consultasService'
import { Rooms } from '../utils/rooms'
import { getIceServersFromEnv, getIceServersFromXirsys } from '../services/iceServers'
import prisma from '../config/database'

type ParamsId = { id: string }
type JoinBody = { userId: string | number; role?: 'medico' | 'paciente' }
type CreateConsultaBody = { medicoId: number; pacienteId: number; status?: 'scheduled' | 'agendada' | 'in_progress' | 'finished' }

export async function createOrGetRoom(req: FastifyRequest<{ Params: ParamsId }>, reply: FastifyReply) {
  const id = Number(req.params.id)
  if (Number.isNaN(id)) return reply.code(400).send({ error: 'invalid_consulta_id' })

  const consulta = await getConsultaById(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  // autorização: apenas médico/paciente da consulta
  const user: any = (req as any).user
  if (!user || (user.id !== consulta.medicoId && user.id !== consulta.pacienteId)) {
    return reply.code(403).send({ error: 'forbidden' })
  }

  const { roomId, created } = Rooms.createOrGet(id)

  // montar iceServers: ambiente > Xirsys > default STUN
  let iceServers: any[] | null = getIceServersFromEnv()
  if (!iceServers) {
    iceServers = await getIceServersFromXirsys()
  }
  if (!iceServers) {
    iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]
  }

  if (created && consulta.status === 'scheduled') await updateConsultaStatus(id, 'in_progress')

  return reply.send({ roomId, iceServers })
}

export async function listParticipants(req: FastifyRequest<{ Params: ParamsId }>, reply: FastifyReply) {
  const id = Number(req.params.id)
  if (Number.isNaN(id)) return reply.code(400).send({ error: 'invalid_consulta_id' })
  const consulta = await getConsultaById(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user: any = (req as any).user
  if (!user || (user.id !== consulta.medicoId && user.id !== consulta.pacienteId)) {
    return reply.code(403).send({ error: 'forbidden' })
  }

  // encontrar room associado à consulta
  let roomId: string | undefined = Rooms.findRoomIdByConsulta(id)
  if (!roomId) roomId = Rooms.createOrGet(id).roomId
  const participants = Rooms.listParticipants(roomId!)
  return reply.send({ roomId, participants })
}

export async function endConsulta(req: FastifyRequest<{ Params: ParamsId }>, reply: FastifyReply) {
  const id = Number(req.params.id)
  if (Number.isNaN(id)) return reply.code(400).send({ error: 'invalid_consulta_id' })
  const consulta = await getConsultaById(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user: any = (req as any).user
  if (!user || (user.id !== consulta.medicoId && user.id !== consulta.pacienteId)) {
    return reply.code(403).send({ error: 'forbidden' })
  }

  // localizar room e encerrar
  let roomId: string | undefined
  // Rooms não expõe internamente o map; manter referência via createOrGet
  const { roomId: rid } = Rooms.createOrGet(id)
  roomId = rid
  Rooms.end(roomId)

  await updateConsultaStatus(id, 'finished')
  return reply.send({ ok: true })
}

export async function joinRoom(req: FastifyRequest<{ Params: ParamsId; Body: JoinBody }>, reply: FastifyReply) {
  const id = Number(req.params.id)
  if (Number.isNaN(id)) return reply.code(400).send({ error: 'invalid_consulta_id' })
  const consulta = await getConsultaById(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })
  const user: any = (req as any).user
  if (!user || (user.id !== consulta.medicoId && user.id !== consulta.pacienteId)) {
    return reply.code(403).send({ error: 'forbidden' })
  }
  const { roomId } = Rooms.createOrGet(id)
  const res = Rooms.addParticipant(roomId, { userId: req.body.userId, role: req.body.role })
  if (!res.ok) return reply.code(409).send({ error: res.reason })
  return reply.send({ roomId, participants: Rooms.listParticipants(roomId) })
}

// Novo fluxo: criar sala sem depender de consulta no DB
export async function createRoomSimple(req: FastifyRequest, reply: FastifyReply) {
  const user: any = (req as any).user
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  // Cria sala em memória com um roomId desvinculado de consulta
  const { roomId } = Rooms.createStandalone()

  // Obter iceServers como antes
  let iceServers: any[] | null = getIceServersFromEnv()
  if (!iceServers) iceServers = await getIceServersFromXirsys()
  if (!iceServers) iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]

  return reply.send({ roomId, iceServers })
}

// --- Endpoints do fluxo de consultas agendadas ---
export async function agendarConsulta(req: FastifyRequest, reply: FastifyReply) {
  const user: any = (req as any).user
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  const body: any = req.body || {}
  const medicoId = body.medico_id === undefined ? null : Number(body.medico_id)
  const pacienteId = Number(body.paciente_id)
  const data_consulta = body.data_consulta
  const hora_inicio = body.hora_inicio
  const hora_fim = body.hora_fim

  if (!pacienteId || Number.isNaN(pacienteId)) return reply.code(400).send({ error: 'invalid_paciente_id' })

  // autorização básica: paciente pode agendar para si, médico pode agendar para paciente, admin pode tudo
  if (user.tipo_usuario === 'paciente') {
    const myPaciente = await prisma.paciente.findUnique({ where: { usuario_id: user.id } })
    if (!myPaciente || myPaciente.id !== pacienteId) return reply.code(403).send({ error: 'forbidden' })
  }

  try {
    const consulta = await createConsulta({ medicoId, pacienteId, status: 'agendada', data_consulta, hora_inicio, hora_fim })
    return reply.send({ ok: true, consulta })
  } catch (err: any) {
    console.error('agendarConsulta error:', err)
    return reply.code(500).send({ error: 'internal_error' })
  }
}
 
export async function listConsultasAgendadas(req: FastifyRequest, reply: FastifyReply) {
  const user: any = (req as any).user
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  const { userId } = req.query as any
  const where: any = { status: 'agendada' }

  if (userId) {
    const id = Number(userId)
    if (Number.isNaN(id)) return reply.code(400).send({ error: 'invalid_user_id' })
    const [paciente, medico] = await Promise.all([
      prisma.paciente.findUnique({ where: { usuario_id: id }, select: { id: true } }),
      prisma.medico.findUnique({ where: { usuario_id: id }, select: { id: true } })
    ])
    const or: any[] = []
    if (paciente) or.push({ pacienteId: paciente.id })
    if (medico) or.push({ medicoId: medico.id })
    if (or.length === 0) return reply.send([])
    where.OR = or
  } else if (user.tipo_usuario === 'paciente') {
    const paciente = await prisma.paciente.findUnique({ where: { usuario_id: user.id }, select: { id: true } })
    if (!paciente) return reply.send([])
    where.pacienteId = paciente.id
  } else if (user.tipo_usuario === 'medico') {
    const medico = await prisma.medico.findUnique({ where: { usuario_id: user.id }, select: { id: true } })
    if (!medico) return reply.send([])
    where.medicoId = medico.id
  }

  const consultas = await prisma.consulta.findMany({ where, orderBy: { data_consulta: 'asc' }, include: { medico: { select: { id: true, nome_completo: true } }, paciente: { select: { id: true, nome_completo: true } } } })
  return reply.send(consultas)
}

export async function listMedicos(req: FastifyRequest, reply: FastifyReply) {
  const user: any = (req as any).user
  if (!user) return reply.code(401).send({ error: 'unauthorized' })
  const medicos = await prisma.medico.findMany({ select: { id: true, nome_completo: true } })
  return reply.send(medicos)
}

