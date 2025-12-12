import { FastifyReply, FastifyRequest } from 'fastify'
import { Rooms } from '../utils/rooms'
import { getIceServersFromEnv, getIceServersFromXirsys } from '../services/iceServers'
import { createConsulta, getConsultaById, updateConsultaStatus, claimConsultaByMedico } from '../services/consultasService'

type FilaItem = {
  consultaId: number
  pacienteId: number
  roomId: string
  createdAt: number
  status: 'scheduled' | 'in_progress'
}

const fila: FilaItem[] = []

export async function criarSalaConsulta(req: FastifyRequest, reply: FastifyReply) {
  const user: any = (req as any).user
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  // cria consulta com paciente e status scheduled; medico_id será definido no claim
  const consulta = await createConsulta({ medicoId: null as any, pacienteId: user.id, status: 'scheduled' })

  // cria sala vinculada à consulta
  const { roomId } = Rooms.createOrGet(consulta.id)

  // iceServers
  let iceServers: any[] | null = getIceServersFromEnv()
  if (!iceServers) iceServers = await getIceServersFromXirsys()
  if (!iceServers) iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]

  // adicionar à fila
  fila.push({ consultaId: consulta.id, pacienteId: user.id, roomId, createdAt: Date.now(), status: 'scheduled' })

  return reply.send({ roomId, consultaId: consulta.id, iceServers })
}

export async function listarFila(req: FastifyRequest, reply: FastifyReply) {
  const user: any = (req as any).user
  if (!user) return reply.code(401).send({ error: 'unauthorized' })
  // opcional: validar role medico
  return reply.send(fila)
}

export async function claimConsulta(req: FastifyRequest<{ Params: { consultaId: string } }>, reply: FastifyReply) {
  const user: any = (req as any).user
  if (!user) return reply.code(401).send({ error: 'unauthorized' })
  const consultaId = Number(req.params.consultaId)
  if (Number.isNaN(consultaId)) return reply.code(400).send({ error: 'invalid_consulta_id' })
  const consulta = await getConsultaById(consultaId)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  // associar médico e marcar in_progress com proteção de duplo claim
  const res = await claimConsultaByMedico(consultaId, user.id)
  if (!res.ok) return reply.code(409).send({ error: res.error })

  // atualizar fila: remover para não aparecer para outros médicos
  const idx = fila.findIndex(f => f.consultaId === consultaId)
  if (idx === -1) return reply.code(404).send({ error: 'fila_item_not_found' })
  fila.splice(idx, 1)

  // obter roomId vinculado
  const { roomId } = Rooms.createOrGet(consultaId)

  // iceServers
  let iceServers: any[] | null = getIceServersFromEnv()
  if (!iceServers) iceServers = await getIceServersFromXirsys()
  if (!iceServers) iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]

  return reply.send({ roomId, consultaId, iceServers })
}

export function removerDaFilaPorConsulta(consultaId: number) {
  const idx = fila.findIndex(f => f.consultaId === consultaId)
  if (idx >= 0) fila.splice(idx, 1)
}
