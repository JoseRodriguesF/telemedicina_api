import {
  getConsultaById,
  getConsultaWithPatient,
  updateConsultaStatus,
  createConsulta,
  listConsultasScheduled,
  evaluateConsulta,
  cancelConsulta
} from '../services/consultasService'
import { Rooms } from '../utils/rooms'
import prisma from '../config/database'
import logger from '../utils/logger'
import {
  getIceServersWithFallback,
  validateNumericId,
  validateDate
} from '../utils/controllerHelpers'
import {
  RequestWithNumericId,
  AuthenticatedUser,
  AgendarConsultaBody,
  JoinRoomBody,
  RequestWithUserId,
  ConsultaStatus,
  TipoUsuario
} from '../types/shared'
import { FastifyReply, FastifyRequest } from 'fastify'

/**
 * Helper to check if user is authorized to access a consultation
 */
function checkAuth(user: AuthenticatedUser, consulta: { medicoId: number | null, pacienteId: number }) {
  console.log('[checkAuth] Checking access:', {
    user: { id: user.id, medicoId: user.medicoId, pacienteId: user.pacienteId, role: user.tipo_usuario },
    consulta: { medicoId: consulta.medicoId, pacienteId: consulta.pacienteId }
  })
  return (user.medicoId && user.medicoId === consulta.medicoId) ||
    (user.pacienteId && user.pacienteId === consulta.pacienteId) ||
    (user.tipo_usuario === 'admin')
}

export async function createOrGetRoom(req: RequestWithNumericId, reply: FastifyReply) {
  const validation = validateNumericId(req.params.id, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const id = validation.numericId!
  const consulta = await getConsultaById(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user = req.user as AuthenticatedUser
  if (!checkAuth(user, consulta)) return reply.code(403).send({ error: 'forbidden' })

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
  const consulta = await getConsultaWithPatient(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user = req.user as AuthenticatedUser
  if (!checkAuth(user, consulta)) return reply.code(403).send({ error: 'forbidden' })

  return reply.send(consulta)
}

export async function listParticipants(req: RequestWithNumericId, reply: FastifyReply) {
  const validation = validateNumericId(req.params.id, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const id = validation.numericId!
  const consulta = await getConsultaById(id)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user = req.user as AuthenticatedUser
  if (!checkAuth(user, consulta)) return reply.code(403).send({ error: 'forbidden' })

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
  if (!checkAuth(user, consulta)) return reply.code(403).send({ error: 'forbidden' })

  const { roomId } = Rooms.createOrGet(id)
  Rooms.end(roomId)

  const { hora_fim, repouso, destino_final, diagnostico, evolucao, plano_terapeutico, endereco_ambulancia } = (req.body as any) || {}

  // Concatenar dados da ambulância na evolução se existirem, já que a consulta não tem campos próprios no momento
  let finalEvolucao = evolucao;
  if (endereco_ambulancia && (String(destino_final).toLowerCase().includes('ambulância') || String(destino_final).toLowerCase().includes('ambulancia'))) {
    finalEvolucao = `${evolucao}\n\n--- DADOS PARA AMBULÂNCIA ---\nEndereço: ${endereco_ambulancia.endereco || '-'}\nComplemento: ${endereco_ambulancia.complemento || '-'}\nTelefone: ${endereco_ambulancia.telefone || '-'}\nInformações: ${endereco_ambulancia.informacoes_adicionais || '-'}`;
  }

  await prisma.consulta.update({
    where: { id },
    data: {
      status: 'finished',
      hora_fim: hora_fim ? new Date(`1970-01-01T${hora_fim}`) : new Date(),
      repouso,
      destino_final,
      diagnostico,
      evolucao: finalEvolucao,
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
  if (!checkAuth(user, consulta)) return reply.code(403).send({ error: 'forbidden' })

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
  const { medico_id, data_consulta, hora_inicio, hora_fim } = req.body
  let { paciente_id } = req.body

  if (user.tipo_usuario === 'paciente') {
    if (!user.pacienteId) {
      return reply.code(403).send({ error: 'paciente_profile_not_found' })
    }
    paciente_id = user.pacienteId
  }

  const validation = validateNumericId(paciente_id, 'paciente_id')
  if (!validation.valid || !paciente_id) return reply.code(400).send(validation.error || { error: 'invalid_paciente_id' })

  const pacienteId = validation.numericId!
  const medicoId = medico_id ? Number(medico_id) : null

  if (medicoId) {
    const med = await prisma.medico.findUnique({ where: { id: medicoId } })
    if (!med || med.verificacao !== 'verificado') {
      return reply.code(400).send({ error: 'medico_not_verified' })
    }
  }

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
      await prisma.historiaClinica.updateMany({
        where: { id: req.body.historiaClinicaId, pacienteId },
        data: { consultaId: consulta.id }
      })
    }

    return reply.send({ ok: true, consulta })
  } catch (err: any) {
    logger.error('Failed to schedule consultation', err)
    return reply.code(500).send({ error: 'internal_error' })
  }
}

export async function listConsultasAgendadas(req: RequestWithUserId, reply: FastifyReply) {
  const user = req.user as AuthenticatedUser
  const { userId } = req.query
  const where: any = {}

  if (userId) {
    const targetUserId = Number(userId)
    if (user.id !== targetUserId && user.tipo_usuario !== 'admin') {
      return reply.code(403).send({ error: 'forbidden' })
    }

    // Resolving profiles for target user would still need a DB call if not current user
    // but usually this is called for current user.
    const target = await prisma.usuario.findUnique({
      where: { id: targetUserId },
      include: { paciente: true, medico: true }
    })

    if (!target) return reply.send([])
    const pId = target.paciente?.id
    const mId = target.medico?.id

    const orConditions: any[] = []
    if (pId) orConditions.push({ pacienteId: pId })
    if (mId) orConditions.push({ medicoId: mId })
    if (orConditions.length === 0) return reply.send([])
    where.OR = orConditions
  } else {
    if (user.tipo_usuario === 'paciente') {
      if (!user.pacienteId) return reply.send([])
      where.pacienteId = user.pacienteId
    } else if (user.tipo_usuario === 'medico') {
      if (!user.medicoId) return reply.send([])
      where.medicoId = user.medicoId
    }
  }

  const consultas = await listConsultasScheduled(where)
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
  const user = req.user as AuthenticatedUser

  const result = await cancelConsulta(id, user.id, user.tipo_usuario)
  if (!result.ok) {
    const code = result.error === 'forbidden' ? 403 : result.error === 'consulta_not_found' ? 404 : 400
    return reply.code(code).send({ error: result.error, message: result.message })
  }

  return reply.send({ ok: true, message: result.message, action: result.data?.action })
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
  const user = req.user as AuthenticatedUser

  if (user.tipo_usuario !== 'paciente') {
    return reply.code(403).send({ error: 'only_patients_can_rate' })
  }

  const body = req.body as { estrelas?: number | string, avaliacao?: string } | null
  const { estrelas, avaliacao } = body || {}

  const numEstrelas = Number(estrelas)
  if (isNaN(numEstrelas) || numEstrelas < 1 || numEstrelas > 5) {
    return reply.code(400).send({ error: 'invalid_rating' })
  }

  if (numEstrelas < 5 && (!avaliacao || String(avaliacao).trim() === '')) {
    return reply.code(400).send({ error: 'justification_required' })
  }

  try {
    await evaluateConsulta(id, numEstrelas, avaliacao)
    return reply.send({ ok: true, message: 'Avaliação registrada' })
  } catch (err: any) {
    logger.error('Error evaluating consultation', err)
    const code = err.message === 'consulta_not_found' ? 404 : 500
    return reply.code(code).send({ error: err.message })
  }
}

export async function updatePacienteNotas(req: RequestWithNumericId, reply: FastifyReply) {
  const validation = validateNumericId(req.params.id, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const id = validation.numericId!
  const consulta = await prisma.consulta.findUnique({
    where: { id },
    include: { paciente: true }
  })
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user = req.user as AuthenticatedUser
  if (user.tipo_usuario !== 'medico' || user.medicoId !== consulta.medicoId) {
    return reply.code(403).send({ error: 'forbidden', message: 'Apenas o médico responsável pode editar as notas do paciente' })
  }

  const { notas } = (req.body as any) || {}

  await prisma.paciente.update({
    where: { id: consulta.pacienteId },
    data: { notas }
  })

  return reply.send({ ok: true })
}
