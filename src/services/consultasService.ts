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
  // prevent double claim: only allow if medicoId is null and status is scheduled
  const consulta = await prisma.consulta.findUnique({ where: { id: consultaId } })
  if (!consulta) return { ok: false, error: 'consulta_not_found' }
  if (consulta.medicoId !== null || consulta.status !== 'scheduled') {
    return { ok: false, error: 'already_claimed_or_in_progress' }
  }
  const updated = await prisma.consulta.update({
    where: { id: consultaId },
    data: { medicoId, status: 'in_progress' }
  })
  return { ok: true, consulta: updated }
}
