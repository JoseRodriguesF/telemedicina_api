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
  RequestWithUserId,
  ConsultaStatus
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

  if (created && ['scheduled', 'agendada', 'solicitada'].includes(consulta.status)) {
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

  const { medico_id, data_consulta, hora_inicio, hora_fim } = req.body
  let { paciente_id } = req.body

  // Se for paciente, usar o próprio pacienteId
  if (user.tipo_usuario === 'paciente') {
    const { pacienteId: userPacienteId } = await resolveUserProfiles(user.id)
    if (!userPacienteId) {
      return reply.code(403).send({
        error: 'paciente_profile_not_found',
        message: 'Perfil de paciente não encontrado para este usuário'
      })
    }
    // Sobrescrever/Definir paciente_id com o ID correto do paciente logado
    paciente_id = userPacienteId
  }

  // Validação agora ocorre com o ID correto (seja vindo do body ou do perfil)
  const validation = validateNumericId(paciente_id, 'paciente_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const pacienteId = validation.numericId!
  const medicoId = medico_id === undefined ? null : Number(medico_id)

  // Validar data
  const dateValidation = validateDate(data_consulta)
  if (!dateValidation.valid) return reply.code(400).send(dateValidation.error!)

  try {
    const consulta = await createConsulta({
      medicoId,
      pacienteId,
      status: 'solicitada',
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
  const where: any = { status: { in: ['agendada', 'solicitada'] } }

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

export async function confirmarConsulta(req: RequestWithNumericId, reply: FastifyReply) {
  const validation = validateNumericId(req.params.id, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const id = validation.numericId!
  const consulta = await getConsultaById(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  if ((consulta.status as ConsultaStatus) !== 'solicitada') {
    return reply.code(400).send({
      error: 'invalid_status_transition',
      message: 'Apenas consultas com status solicitado podem ser confirmadas'
    })
  }

  const user = req.user as AuthenticatedUser
  // Opcional: Adicionar lógica de permissão aqui se necessário (ex: apenas o médico ou admin)

  const updated = await updateConsultaStatus(id, 'agendada')
  return reply.send({ ok: true, consulta: updated })
}


export async function cancelarConsulta(req: RequestWithNumericId, reply: FastifyReply) {
  const validation = validateNumericId(req.params.id, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const id = validation.numericId!
  const consulta = await getConsultaById(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user = req.user as AuthenticatedUser
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  // Verificar se a consulta está em um estado que permite cancelamento
  if (consulta.status === 'finished') {
    return reply.code(400).send({
      error: 'cannot_cancel_finished_consultation',
      message: 'Não é possível cancelar consultas finalizadas'
    })
  }

  // Lógica específica para médicos: Tentar reatribuir em vez de excluir
  if (user.tipo_usuario === 'medico') {
    const { medicoId } = await resolveUserProfiles(user.id)

    // Se o médico for o responsável pela consulta
    if (medicoId && consulta.medicoId === medicoId) {
      // 1. Encontrar outro médico disponível
      // Busca o primeiro médico que não seja o atual
      const replacementDoctor = await prisma.medico.findFirst({
        where: {
          id: { not: medicoId }
        }
      })

      if (replacementDoctor) {
        // 2. Reatribuir a consulta
        const updated = await prisma.consulta.update({
          where: { id },
          data: { medicoId: replacementDoctor.id }
        })

        logger.info('Consulta reatribuída automaticamente', {
          consultaId: id,
          oldMedicoId: medicoId,
          newMedicoId: replacementDoctor.id
        })

        return reply.send({
          ok: true,
          message: 'Consulta retransferida para outro médico',
          consulta: updated,
          action: 'reassigned'
        })
      } else {
        // Se não houver outro médico, liberar a consulta (remove atribuição)
        // Isso permite que a consulta volte para uma fila geral, se existir, ou fique pendente
        const updated = await prisma.consulta.update({
          where: { id },
          data: { medicoId: null }
        })

        logger.info('Consulta liberada (sem médico substituto)', {
          consultaId: id,
          oldMedicoId: medicoId
        })

        return reply.send({
          ok: true,
          message: 'Consulta liberada (nenhum outro médico encontrado)',
          consulta: updated,
          action: 'released'
        })
      }
    }
  }

  // --- Comportamento padrão (Paciente cancelando, ou Admin, ou Médico cancelando de outro) ---

  // Verificar permissões para paciente
  if (user.tipo_usuario === 'paciente') {
    const { pacienteId } = await resolveUserProfiles(user.id)
    if (!pacienteId || consulta.pacienteId !== pacienteId) {
      return reply.code(403).send({ error: 'forbidden' })
    }
  }

  // Se a consulta está em andamento, encerrar a sala antes de deletar
  if (consulta.status === 'in_progress') {
    const roomId = Rooms.findRoomIdByConsulta(id)
    if (roomId) {
      Rooms.end(roomId)
    }
  }

  // Deletar a consulta
  await prisma.consulta.delete({ where: { id } })

  logger.info('Consulta cancelada e excluída', {
    consultaId: id,
    userId: user.id,
    previousStatus: consulta.status
  })

  return reply.send({ ok: true, message: 'Consulta cancelada com sucesso' })
}

export async function listMedicos(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as AuthenticatedUser
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  const medicos = await prisma.medico.findMany({
    select: { id: true, nome_completo: true }
  })

  return reply.send(medicos)
}
