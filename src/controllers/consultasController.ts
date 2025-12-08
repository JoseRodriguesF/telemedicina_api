import { FastifyReply, FastifyRequest } from 'fastify'
import { getConsultaById, updateConsultaStatus } from '../services/consultasService'
import { Rooms } from '../utils/rooms'

type ParamsId = { id: string }
type JoinBody = { userId: string | number; role?: 'medico' | 'paciente' }

export async function createOrGetRoom(req: FastifyRequest<{ Params: ParamsId }>, reply: FastifyReply) {
  const id = Number(req.params.id)
  if (Number.isNaN(id)) return reply.code(400).send({ error: 'invalid_consulta_id' })

  const consulta = await getConsultaById(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const { roomId, created } = Rooms.createOrGet(id)

  // montar iceServers do ambiente
  const iceServers: any[] = []
  iceServers.push({ urls: process.env.STUN_URL || 'stun:stun.l.google.com:19302' })
  if (process.env.TURN_URL && process.env.TURN_USER && process.env.TURN_PASS) {
    iceServers.push({ urls: process.env.TURN_URL, username: process.env.TURN_USER, credential: process.env.TURN_PASS })
  }

  if (created && consulta.status === 'scheduled') await updateConsultaStatus(id, 'in_progress')

  return reply.send({ roomId, iceServers })
}

export async function listParticipants(req: FastifyRequest<{ Params: ParamsId }>, reply: FastifyReply) {
  const id = Number(req.params.id)
  if (Number.isNaN(id)) return reply.code(400).send({ error: 'invalid_consulta_id' })
  const consulta = await getConsultaById(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

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
  const { roomId } = Rooms.createOrGet(id)
  const res = Rooms.addParticipant(roomId, { userId: req.body.userId, role: req.body.role })
  if (!res.ok) return reply.code(409).send({ error: res.reason })
  return reply.send({ roomId, participants: Rooms.listParticipants(roomId) })
}
