import prisma from '../config/database'
import { ConsultaStatus, ServiceResult } from '../types/shared'
import logger from '../utils/logger'

export async function getConsultaById(id: number) {
  return prisma.consulta.findUnique({ where: { id } })
}

export async function getConsultaWithPatient(id: number) {
  return prisma.consulta.findUnique({
    where: { id },
    include: {
      paciente: {
        select: {
          id: true,
          nome_completo: true,
          data_nascimento: true,
          cpf: true,
          sexo: true,
          estado_civil: true,
          telefone: true,
          notas: true,
          usuario: {
            select: {
              email: true,
            }
          }
        }
      },
      historiaClinica: true
    }
  })
}

export async function updateConsultaStatus(id: number, status: ConsultaStatus) {
  return prisma.consulta.update({ where: { id }, data: { status } })
}

interface CreateConsultaData {
  medicoId: number | null
  pacienteId: number
  status?: ConsultaStatus
  data_consulta?: string | Date
  hora_inicio?: string
  hora_fim?: string
}

export async function createConsulta(data: CreateConsultaData) {
  const status = data.status ?? 'scheduled'

  return prisma.consulta.create({
    data: {
      medicoId: data.medicoId || null,
      pacienteId: data.pacienteId,
      status,
      data_consulta: data.data_consulta ? new Date(data.data_consulta) : undefined,
      hora_inicio: data.hora_inicio || undefined,
      hora_fim: data.hora_fim || undefined,
    }
  })
}

export async function claimConsultaByMedico(
  consultaId: number,
  medicoId: number
): Promise<ServiceResult> {
  // 1. Buscar dados para validação de territorialidade (CFM Res. 2.314/2022 Art. 2)
  const [consulta, medico] = await Promise.all([
    prisma.consulta.findUnique({ 
      where: { id: consultaId },
      include: { paciente: { include: { usuario: { include: { enderecos: true } } } } }
    }),
    prisma.medico.findUnique({ where: { id: medicoId } })
  ]);

  if (!consulta || !medico) {
    return { ok: false, error: 'not_found' };
  }

  // Validação de Territorialidade (Log de Alerta)
  const pacienteEstado = consulta.paciente.usuario.enderecos[0]?.estado;
  const medicoUF = medico.crm_uf;

  if (pacienteEstado && medicoUF && pacienteEstado !== medicoUF) {
    logger.warn(`CONFORMIDADE CFM: Médico (UF: ${medicoUF}) atendendo paciente em estado diferente (UF: ${pacienteEstado}).`, {
      consultaId,
      medicoId,
      pacienteId: consulta.pacienteId
    });
  }

  // 2. Atomic claim: update only if still scheduled and unassigned
  const res = await prisma.consulta.updateMany({
    where: {
      id: consultaId,
      medicoId: null,
      status: { in: ['scheduled', 'solicitada', 'agendada'] }
    },
    data: {
      medicoId,
      status: 'in_progress',
      hora_inicio: new Date()
    }
  })

  if (res.count === 0) {
    // Either not found, already claimed, or already in progress
    const exists = await prisma.consulta.findUnique({ where: { id: consultaId } })

    if (!exists) {
      return { ok: false, error: 'consulta_not_found' }
    }

    // Permitir reconexão: se o médico tentando o claim já é o médico associado e a consulta está em andamento
    if (exists.medicoId === medicoId && exists.status === 'in_progress') {
      return { ok: true, data: exists }
    }

    return { ok: false, error: 'already_claimed_or_in_progress' }
  }

  const updated = await prisma.consulta.findUnique({ where: { id: consultaId } })
  return { ok: true, data: updated }
}

export async function reconnectConsultaByPaciente(
  consultaId: number,
  pacienteId: number
): Promise<ServiceResult> {
  const exists = await prisma.consulta.findUnique({ where: { id: consultaId } })

  if (!exists) {
    return { ok: false, error: 'consulta_not_found' }
  }

  // Permitir reconexão: se o paciente tentando é o dono da consulta e ela está ativa
  const activeStatuses: ConsultaStatus[] = ['scheduled', 'agendada', 'solicitada', 'in_progress']
  if (exists.pacienteId === pacienteId && activeStatuses.includes(exists.status as ConsultaStatus)) {
    return { ok: true, data: exists }
  }

  return { ok: false, error: 'not_authorized_to_reconnect' }
}

/**
 * Cancela uma consulta com lógica de reatribuição para médicos
 * Se médico cancela: tenta reatribuir para outro médico
 * Se paciente cancela: deleta a consulta
 */
export async function cancelConsulta(
  consultaId: number,
  userId: number,
  tipoUsuario: 'medico' | 'paciente' | 'admin'
): Promise<ServiceResult<{ action: 'deleted' | 'reassigned' | 'released' }>> {
  const consulta = await prisma.consulta.findUnique({ where: { id: consultaId } })

  if (!consulta) {
    return { ok: false, error: 'consulta_not_found' }
  }

  if (consulta.status === 'finished' || consulta.status === 'cancelled') {
    return { ok: false, error: 'cannot_cancel_already_cancelled_or_finished_consultation' }
  }

  // Identificar quem cancelou para salvar nos novos campos
  let canceladoPor: string = tipoUsuario;
  let canceladoPorId: number | undefined = userId;

  // Lógica específica para médico: No sistema atual, se o médico cancela,
  // poderíamos reatribuir, mas usuário quer que a consulta seja "realmente desmarcada".
  // Então vamos mudar o status para 'cancelled' para todos.
  
  if (tipoUsuario === 'medico') {
    const medico = await prisma.medico.findUnique({ where: { usuario_id: userId } })
    if (medico && consulta.medicoId === medico.id) {
        canceladoPor = 'medico';
        canceladoPorId = medico.id;
    }
  } else if (tipoUsuario === 'paciente') {
    const paciente = await prisma.paciente.findUnique({ where: { usuario_id: userId } })
    if (paciente && consulta.pacienteId === paciente.id) {
        canceladoPor = 'paciente';
        canceladoPorId = paciente.id;
    } else {
        return { ok: false, error: 'forbidden' }
    }
  }

  // Atualizar para status cancelado sem deletar
  await prisma.consulta.update({
    where: { id: consultaId },
    data: {
      status: 'cancelled',
      canceladoPor,
      canceladoPorId
    }
  })

  return { ok: true, data: { action: 'deleted' }, message: 'Consulta desmarcada com sucesso para ambas as partes' }
}

/**
 * Marca consultas agendadas ou solicitadas que passaram da data como expiradas.
 */
export async function cleanupExpiredConsultations() {
  try {
    const now = new Date()
    
    // 1. Consultas com data anterior a hoje (ignorando horário)
    const yesterday = new Date(now)
    yesterday.setHours(0, 0, 0, 0)

    const resPastDays = await prisma.consulta.updateMany({
      where: {
        status: { in: ['agendada', 'solicitada', 'scheduled'] },
        data_consulta: { lt: yesterday }
      },
      data: { status: 'expired' }
    })

    if (resPastDays.count > 0) {
      logger.info(`[Cleanup] Marcou ${resPastDays.count} consultas de dias anteriores como expiradas.`)
    }

    // 2. Consultas de HOJE que já passaram do horário (buffer de 2 horas)
    // Nota: O campo hora_inicio no Postgres (db.Time) é lido pelo Prisma como 1970-01-01T...
    // Precisamos comparar apenas a parte do tempo.
    
    // Buscar consultas de hoje para verificar horário
    const todayConsultas = await prisma.consulta.findMany({
      where: {
        status: { in: ['agendada', 'solicitada', 'scheduled'] },
        data_consulta: {
          gte: yesterday,
          lt: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000)
        }
      }
    })

    if (todayConsultas.length > 0) {
      // Diferença em minutos para expiração conforme pedido do usuário (20 minutos)
      const EXPIRATION_BUFFER_MINUTES = 20;

      const expiredTodayIds: number[] = []

      for (const c of todayConsultas) {
        if (c.hora_inicio) {
          // Diferença em ms entre Agora e a Hora de Início prevista
          // Nota: hora_inicio do Prisma vem como Date(1970-01-01T...)
          // Precisamos comparar apenas os minutos absolutos do dia.
          const currentHour = now.getHours()
          const currentMin = now.getMinutes()
          
          const startHour = c.hora_inicio.getHours()
          const startMin = c.hora_inicio.getMinutes()
          
          const currentMinutesTotal = currentHour * 60 + currentMin
          const startMinutesTotal = startHour * 60 + startMin
          
          // Se passaram mais de 20 minutos do horário previsto
          if (currentMinutesTotal >= (startMinutesTotal + EXPIRATION_BUFFER_MINUTES)) {
            expiredTodayIds.push(c.id)
          }
        }
      }

      if (expiredTodayIds.length > 0) {
        await prisma.consulta.updateMany({
          where: { id: { in: expiredTodayIds } },
          data: { status: 'expired' }
        })
        logger.info(`[Cleanup] Marcou ${expiredTodayIds.length} consultas de HOJE como expiradas por atraso (> 20 min).`)
      }
    }

  } catch (err) {
    logger.error('[Cleanup] Erro ao limpar consultas expiradas', err as Error)
  }
}

export async function listConsultasScheduled(where: any) {
  // Garantir que a lista esteja limpa antes de retornar
  await cleanupExpiredConsultations()

  return prisma.consulta.findMany({
    where: {
      ...where,
      status: { in: ['agendada', 'solicitada'] }
    },
    orderBy: [
      { data_consulta: 'asc' },
      { hora_inicio: 'asc' }
    ],
    include: {
      medico: { select: { id: true, nome_completo: true } },
      paciente: { select: { id: true, nome_completo: true } },
      historiaClinica: true
    }
  })
}

export async function evaluateConsulta(consultaId: number, numEstrelas: number, avaliacao?: string) {
  const consulta = await prisma.consulta.findUnique({ where: { id: consultaId } })
  if (!consulta) throw new Error('consulta_not_found')

  // Update Consulta
  await prisma.consulta.update({
    where: { id: consultaId },
    data: {
      estrelas: numEstrelas,
      avaliacao: avaliacao || null
    } as any
  })

  // Update Medico Average
  if (consulta.medicoId) {
    const ratings = await prisma.consulta.findMany({
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
}
