export async function listarSalasEmAndamento(req: FastifyRequest, reply: FastifyReply) {
  const user: any = (req as any).user
  if (!user) {
    req.log.warn({ route: '/ps/salas-em-andamento' }, 'unauthorized_missing_user_in_request')
    return reply.code(401).send({ error: 'unauthorized' })
  }
  // Apenas médicos deveriam consultar as salas em andamento (opcionalmente liberar para admin)
  if (user.tipo_usuario !== 'medico') {
    req.log.warn({ route: '/ps/salas-em-andamento', userId: user.id, tipo_usuario: user.tipo_usuario }, 'forbidden_only_medico_can_list_in_progress_rooms')
    return reply.code(403).send({ error: 'forbidden_only_medico_can_list_in_progress_rooms' })
  }

  // Buscar diretamente do banco todas consultas em andamento
  const consultas = await prisma.consulta.findMany({
    where: { status: 'in_progress' },
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

  req.log.info({ route: '/ps/salas-em-andamento', items: items.length }, 'in_progress_rooms_listed_from_db')
  return reply.send(items)
}
import { FastifyReply, FastifyRequest } from 'fastify'
import { Rooms } from '../utils/rooms'
import { getIceServersFromEnv, getIceServersFromXirsys } from '../services/iceServers'
import { createConsulta, getConsultaById, updateConsultaStatus, claimConsultaByMedico } from '../services/consultasService'
import prisma from '../config/database'

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
  if (!user) {
    req.log.warn({ route: '/ps/rooms' }, 'unauthorized_missing_user_in_request')
    return reply.code(401).send({ error: 'unauthorized' })
  }
  // Apenas pacientes podem iniciar consultas no pronto socorro
  if (user.tipo_usuario !== 'paciente') {
    req.log.warn({ route: '/ps/rooms', userId: user.id, tipo_usuario: user.tipo_usuario }, 'forbidden_only_paciente_can_create_room')
    return reply.code(403).send({ error: 'forbidden_only_paciente_can_create_room' })
  }

  // Mapear usuario.id -> paciente.id
  const paciente = await prisma.paciente.findUnique({ where: { usuario_id: user.id } })
  if (!paciente) {
    req.log.error({ route: '/ps/rooms', usuarioId: user.id }, 'paciente_record_not_found_for_usuario')
    return reply.code(409).send({ error: 'paciente_record_not_found_for_usuario' })
  }

  // cria consulta com paciente e status scheduled; medico_id será definido no claim
  const consulta = await createConsulta({ medicoId: null as any, pacienteId: paciente.id, status: 'scheduled' })

  // cria sala vinculada à consulta
  const { roomId } = Rooms.createOrGet(consulta.id)

  // iceServers
  let iceServers: any[] | null = getIceServersFromEnv()
  if (!iceServers) iceServers = await getIceServersFromXirsys()
  if (!iceServers) iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]

  // NÃO adicionar à fila em memória; a fila agora é buscada do banco

  req.log.info({ route: '/ps/rooms', consultaId: consulta.id, pacienteId: paciente.id, roomId }, 'room_created_and_consulta_scheduled_db_backed_queue')
  return reply.send({ roomId, consultaId: consulta.id, iceServers })
}

export async function listarFila(req: FastifyRequest, reply: FastifyReply) {
  const user: any = (req as any).user
  if (!user) {
    req.log.warn({ route: '/ps/fila' }, 'unauthorized_missing_user_in_request')
    return reply.code(401).send({ error: 'unauthorized' })
  }
  // Apenas médicos deveriam consultar a fila (opcionalmente liberar para admin)
  if (user.tipo_usuario !== 'medico') {
    req.log.warn({ route: '/ps/fila', userId: user.id, tipo_usuario: user.tipo_usuario }, 'forbidden_only_medico_can_list_queue')
    return reply.code(403).send({ error: 'forbidden_only_medico_can_list_queue' })
  }

  // Importante: a fila não pode depender de memória local (multi-pod/hibernação)
  // Buscar diretamente do banco todas consultas agendadas sem médico associado
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

  req.log.info({ route: '/ps/fila', items: items.length }, 'fila_listed_from_db')
  return reply.send(items)
}

export async function claimConsulta(req: FastifyRequest<{ Params: { consultaId: string } }>, reply: FastifyReply) {
  const user: any = (req as any).user
  if (!user) {
    req.log.warn({ route: '/ps/fila/:consultaId/claim' }, 'unauthorized_missing_user_in_request')
    return reply.code(401).send({ error: 'unauthorized' })
  }
  // Apenas médicos podem fazer claim de consultas
  if (user.tipo_usuario !== 'medico') {
    req.log.warn({ route: '/ps/fila/:consultaId/claim', userId: user.id, tipo_usuario: user.tipo_usuario }, 'forbidden_only_medico_can_claim')
    return reply.code(403).send({ error: 'forbidden_only_medico_can_claim' })
  }
  const consultaId = Number(req.params.consultaId)
  if (Number.isNaN(consultaId)) {
    req.log.warn({ route: '/ps/fila/:consultaId/claim', rawConsultaId: req.params.consultaId }, 'invalid_consulta_id')
    return reply.code(400).send({ error: 'invalid_consulta_id' })
  }
  const consulta = await getConsultaById(consultaId)
  if (!consulta) {
    req.log.warn({ route: '/ps/fila/:consultaId/claim', consultaId }, 'consulta_not_found')
    return reply.code(404).send({ error: 'consulta_not_found' })
  }

  // Mapear usuario.id -> medico.id
  const medico = await prisma.medico.findUnique({ where: { usuario_id: user.id } })
  if (!medico) {
    req.log.error({ route: '/ps/fila/:consultaId/claim', usuarioId: user.id }, 'medico_record_not_found_for_usuario')
    return reply.code(409).send({ error: 'medico_record_not_found_for_usuario' })
  }

  // associar médico e marcar in_progress com proteção de duplo claim
  const res = await claimConsultaByMedico(consultaId, medico.id)
  if (!res.ok) {
    req.log.warn({ route: '/ps/fila/:consultaId/claim', consultaId, medicoId: medico.id, reason: res.error }, 'claim_failed')
    return reply.code(409).send({ error: res.error })
  }

  // Remoção best-effort da fila em memória (não bloqueante)
  const idx = fila.findIndex(f => f.consultaId === consultaId)
  if (idx >= 0) fila.splice(idx, 1)

  // obter roomId vinculado
  const { roomId } = Rooms.createOrGet(consultaId)

  // iceServers
  let iceServers: any[] | null = getIceServersFromEnv()
  if (!iceServers) iceServers = await getIceServersFromXirsys()
  if (!iceServers) iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]

  req.log.info({ route: '/ps/fila/:consultaId/claim', consultaId, medicoId: medico.id, roomId }, 'consulta_claimed_and_room_ready_db_backed_queue')
  // Log explícito de pareamento médico/paciente na mesma sala (via HTTP flow)
  try {
    req.log.info({
      route: '/ps/fila/:consultaId/claim',
      msg: 'medico_and_paciente_connected_same_room',
      consultaId,
      medicoId: medico.id,
      pacienteId: consulta.pacienteId,
      roomId
    })
  } catch {}
  return reply.send({ roomId, consultaId, iceServers })
}

export function removerDaFilaPorConsulta(consultaId: number) {
  const idx = fila.findIndex(f => f.consultaId === consultaId)
  if (idx >= 0) fila.splice(idx, 1)
}
