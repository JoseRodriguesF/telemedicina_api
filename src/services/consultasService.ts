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
    data: { medicoId, status: 'in_progress' }
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
