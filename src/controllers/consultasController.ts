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
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  const { medicoId, pacienteId } = await resolveUserProfiles(user.id)
  const isAuthorized = (medicoId && medicoId === consulta.medicoId) ||
    (pacienteId && pacienteId === consulta.pacienteId) ||
    (user.tipo_usuario === 'admin')

  if (!isAuthorized) {
    return reply.code(403).send({ error: 'forbidden' })
  }

  const { roomId, created } = Rooms.createOrGet(id)
  const iceServers = await getIceServersWithFallback()

  if (created && ['scheduled', 'agendada', 'solicitada'].includes(consulta.status)) {
    await updateConsultaStatus(id, 'in_progress')
  }

  return reply.send({ roomId, iceServers })
}

export async function getConsultaDetails(req: RequestWithNumericId, reply: FastifyReply) {
  const validation = validateNumericId(req.params.id, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const id = validation.numericId!

  // Buscar consulta com dados do paciente
  const consulta = await prisma.consulta.findUnique({
    where: { id },
    include: {
      paciente: true
    }
  })

  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user = req.user as AuthenticatedUser
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  const { medicoId, pacienteId } = await resolveUserProfiles(user.id)
  const isAuthorized = (medicoId && medicoId === consulta.medicoId) ||
    (pacienteId && pacienteId === consulta.pacienteId) ||
    (user.tipo_usuario === 'admin')

  if (!isAuthorized) {
    return reply.code(403).send({ error: 'forbidden' })
  }

  return reply.send(consulta)
}

export async function listParticipants(req: RequestWithNumericId, reply: FastifyReply) {
  const validation = validateNumericId(req.params.id, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const id = validation.numericId!
  const consulta = await getConsultaById(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user = req.user as AuthenticatedUser
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  const { medicoId, pacienteId } = await resolveUserProfiles(user.id)
  const isAuthorized = (medicoId && medicoId === consulta.medicoId) ||
    (pacienteId && pacienteId === consulta.pacienteId) ||
    (user.tipo_usuario === 'admin')

  if (!isAuthorized) {
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
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  const { medicoId, pacienteId } = await resolveUserProfiles(user.id)
  const isAuthorized = (medicoId && medicoId === consulta.medicoId) ||
    (pacienteId && pacienteId === consulta.pacienteId) ||
    (user.tipo_usuario === 'admin')

  if (!isAuthorized) {
    return reply.code(403).send({ error: 'forbidden' })
  }

  const { roomId } = Rooms.createOrGet(id)
  Rooms.end(roomId)

  const { hora_fim, repouso, destino_final, diagnostico, evolucao, plano_terapeutico } = (req.body as any) || {}

  await prisma.consulta.update({
    where: { id },
    data: {
      status: 'finished',
      hora_fim: hora_fim ? new Date(`1970-01-01T${hora_fim}`) : new Date(),
      repouso,
      destino_final,
      diagnostico,
      evolucao,
      plano_terapeutico
    }
  })
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
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  const { medicoId, pacienteId } = await resolveUserProfiles(user.id)
  const isAuthorized = (medicoId && medicoId === consulta.medicoId) ||
    (pacienteId && pacienteId === consulta.pacienteId) ||
    (user.tipo_usuario === 'admin')

  if (!isAuthorized) {
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
  if (!validation.valid || !paciente_id) return reply.code(400).send(validation.error || { error: 'invalid_paciente_id' })

  const pacienteId = validation.numericId!
  const medicoId = (medico_id === undefined || medico_id === null || String(medico_id) === '') ? null : Number(medico_id)

  // Validar se o médico selecionado está verificado
  if (medicoId) {
    const med = await prisma.medico.findUnique({ where: { id: medicoId } })
    if (!med || med.verificacao !== 'verificado') {
      return reply.code(400).send({
        error: 'medico_not_verified',
        message: 'O médico selecionado ainda não foi verificado.'
      })
    }
  }

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

    if (req.body.historiaClinicaId) {
      try {
        await prisma.historiaClinica.updateMany({
          where: { id: req.body.historiaClinicaId, pacienteId },
          data: { consultaId: consulta.id }
        })
      } catch (error) {
        logger.error('Erro ao vincular história clínica à consulta agendada', error, { consultaId: consulta.id })
      }
    }

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
    const targetUserId = Number(userId)

    // Segurança: Apenas o próprio usuário ou um administrador pode listar consultas por userId
    if (user.id !== targetUserId && user.tipo_usuario !== 'admin') {
      return reply.code(403).send({ error: 'forbidden', message: 'Você não tem permissão para ver consultas de outro usuário.' })
    }

    const { pacienteId, medicoId } = await resolveUserProfiles(targetUserId)
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
    orderBy: [
      { data_consulta: 'asc' },
      { hora_inicio: 'asc' }
    ],
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
          id: { not: medicoId },
          verificacao: 'verificado'
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
    where: {
      verificacao: 'verificado'
    },
    select: { id: true, nome_completo: true }
  })

  return reply.send(medicos)
}

export async function avaliarConsulta(req: RequestWithNumericId, reply: FastifyReply) {
  const validation = validateNumericId(req.params.id, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const id = validation.numericId!
  const consulta = await getConsultaById(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user = req.user as AuthenticatedUser
  if (!user) return reply.code(401).send({ error: 'unauthorized' })

  // Verify if user is patient
  if (user.tipo_usuario !== 'paciente') {
    return reply.code(403).send({
      error: 'only_patients_can_rate',
      message: 'Apenas pacientes podem avaliar consultas.'
    })
  }

  const { pacienteId } = await resolveUserProfiles(user.id)
  if (!pacienteId || consulta.pacienteId !== pacienteId) {
    return reply.code(403).send({
      error: 'forbidden',
      message: 'Você só pode avaliar suas próprias consultas.'
    })
  }

  // Validate inputs
  const body = req.body as { estrelas?: number | string, avaliacao?: string } | null
  const { estrelas, avaliacao } = body || {}

  if (estrelas === undefined || estrelas === null || !Number.isInteger(Number(estrelas))) {
    return reply.code(400).send({
      error: 'invalid_rating',
      message: 'Estrelas deve ser um número inteiro entre 1 e 5.'
    })
  }

  const numEstrelas = Number(estrelas)
  if (numEstrelas < 1 || numEstrelas > 5) {
    return reply.code(400).send({
      error: 'invalid_rating',
      message: 'Estrelas deve ser entre 1 e 5.'
    })
  }

  if (numEstrelas < 5 && (!avaliacao || String(avaliacao).trim() === '')) {
    return reply.code(400).send({
      error: 'justification_required',
      message: 'Justificativa é obrigatória para avaliações menores que 5 estrelas.'
    })
  }

  try {
    // Update Consulta
    await prisma.consulta.update({
      where: { id },
      data: {
        estrelas: numEstrelas,
        avaliacao: avaliacao || null
      } as any
    })

    // Update Medico Average Logic
    if (consulta.medicoId) {
      const ratings = await (prisma.consulta as any).findMany({
        where: {
          medicoId: consulta.medicoId,
          estrelas: { not: null }
        },
        select: { estrelas: true }
      })

      if (ratings.length > 0) {
        const totalStars = ratings.reduce((acc: number, curr: any) => acc + (curr.estrelas || 0), 0)
        const average = totalStars / ratings.length

        await prisma.medico.update({
          where: { id: consulta.medicoId },
          data: { avaliacao: average } as any
        })
      }
    }

    return reply.send({ ok: true, message: 'Avaliação registrada com sucesso.' })

  } catch (err: any) {
    logger.error('Erro ao avaliar consulta', err, { consultaId: id, userId: user.id })
    return reply.code(500).send({ error: 'internal_error', details: err.message })
  }
}
