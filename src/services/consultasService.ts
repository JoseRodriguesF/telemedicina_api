import prisma from '../config/database'

export async function getConsultaById(id: number) {
  return prisma.consulta.findUnique({ where: { id } })
}

export async function updateConsultaStatus(id: number, status: 'scheduled' | 'in_progress' | 'finished') {
  return prisma.consulta.update({ where: { id }, data: { status } })
}

export async function createConsulta(data: { medicoId: number | null; pacienteId: number; status?: 'scheduled' | 'in_progress' | 'finished' }) {
  const status = data.status ?? 'scheduled'
  return prisma.consulta.create({
    data: {
      medicoId: (data.medicoId ?? undefined) as any,
      pacienteId: data.pacienteId,
      status
    }
  })
}

export async function claimConsultaByMedico(consultaId: number, medicoId: number) {
  // Atomic claim: update only if still scheduled and unassigned
  const res = await prisma.consulta.updateMany({
    where: { id: consultaId, medicoId: null, status: 'scheduled' },
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
      return { ok: true, consulta: exists }
    }

    return { ok: false, error: 'already_claimed_or_in_progress' }
  }

  const updated = await prisma.consulta.findUnique({ where: { id: consultaId } })
  return { ok: true, consulta: updated }
}
