import prisma from '../config/database'

export async function getConsultaById(id: number) {
  return prisma.consulta.findUnique({ where: { id } })
}

export async function updateConsultaStatus(id: number, status: 'scheduled' | 'in_progress' | 'finished') {
  return prisma.consulta.update({ where: { id }, data: { status } })
}
