import prisma from '../config/database'
import { ConsultaStatus, ServiceResult } from '../types/shared'

export async function getConsultaById(id: number) {
  return prisma.consulta.findUnique({ where: { id } })
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
  // Atomic claim: update only if still scheduled and unassigned
  const res = await prisma.consulta.updateMany({
    where: {
      id: consultaId,
      medicoId: null,
      status: { in: ['scheduled', 'solicitada', 'agendada'] }
    },
    data: {
      medicoId,
      status: 'in_progress',
      // Usar a hora atual do servidor como UTC
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

  if (consulta.status === 'finished') {
    return { ok: false, error: 'cannot_cancel_finished_consultation' }
  }

  // Lógica para médico: tentar reatribuir
  if (tipoUsuario === 'medico') {
    const medico = await prisma.medico.findUnique({ where: { usuario_id: userId } })

    if (medico && consulta.medicoId === medico.id) {
      // Buscar médico substituto
      const replacementDoctor = await prisma.medico.findFirst({
        where: {
          id: { not: medico.id },
          verificacao: 'verificado'
        }
      })

      if (replacementDoctor) {
        // Reatribuir
        const updated = await prisma.consulta.update({
          where: { id: consultaId },
          data: { medicoId: replacementDoctor.id }
        })
        return { ok: true, data: { action: 'reassigned' }, message: 'Consulta reatribuída para outro médico' }
      } else {
        // Liberar (sem médico)
        const updated = await prisma.consulta.update({
          where: { id: consultaId },
          data: { medicoId: null }
        })
        return { ok: true, data: { action: 'released' }, message: 'Consulta liberada' }
      }
    }
  }

  // Lógica para paciente ou admin: deletar
  if (tipoUsuario === 'paciente') {
    const paciente = await prisma.paciente.findUnique({ where: { usuario_id: userId } })
    if (!paciente || consulta.pacienteId !== paciente.id) {
      return { ok: false, error: 'forbidden' }
    }
  }

  // Deletar consulta
  await prisma.consulta.delete({ where: { id: consultaId } })
  return { ok: true, data: { action: 'deleted' }, message: 'Consulta cancelada com sucesso' }
}
