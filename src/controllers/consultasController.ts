import { FastifyReply, FastifyRequest } from 'fastify'
import { getConsultaById, updateConsultaStatus } from '../services/consultasService'
import { Rooms } from '../utils/rooms'
import { getIceServersFromEnv, getIceServersFromXirsys } from '../services/iceServers'

type ParamsId = { id: string }
type JoinBody = { userId: string | number; role?: 'medico' | 'paciente' }
type CreateConsultaBody = { medicoId: number; pacienteId: number; status?: 'scheduled' | 'in_progress' | 'finished' }

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
