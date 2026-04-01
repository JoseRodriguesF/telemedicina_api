import { FastifyReply, FastifyRequest } from 'fastify'
import prisma from '../config/database'
import logger from '../utils/logger'
import { validateNumericId } from '../utils/controllerHelpers'
import { AuthenticatedUser } from '../types/shared'
import { getConsultaById } from '../services/consultasService'
import { logAuditoria } from '../utils/auditLogger'

/**
 * Salva uma lista de anexos (arquivos do paciente) vinculados a uma consulta
 * POST /consultas/:id/anexos
 * Body: { anexos: Array<{ data: string; nome?: string; tipo_mime: string }> }
 */
export async function salvarAnexos(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const validation = validateNumericId(req.params.id, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const consultaId = validation.numericId!
  const consulta = await getConsultaById(consultaId)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user = req.user as AuthenticatedUser

  // Apenas o próprio paciente da consulta pode enviar anexos
  if (user.tipo_usuario !== 'paciente' || user.pacienteId !== consulta.pacienteId) {
    return reply.code(403).send({ error: 'forbidden', message: 'Apenas o paciente da consulta pode enviar arquivos.' })
  }

  const body = (req.body as any) || {}
  const anexos: Array<{ data: string; nome?: string; tipo_mime: string }> = Array.isArray(body.anexos) ? body.anexos : []

  if (anexos.length === 0) {
    return reply.code(400).send({ error: 'no_anexos', message: 'Nenhum arquivo foi enviado.' })
  }

  try {
    // Para cada arquivo, converte o base64 (string) para um Buffer binário
    const attachmentsToSave = anexos.map(a => {
      // Se vier com prefixo "data:...base64,", removemos
      const base64Clean = a.data.includes('base64,') ? a.data.split('base64,')[1] : a.data;
      return {
        consultaId,
        arquivo: Buffer.from(base64Clean, 'base64'),
        tipo_mime: a.tipo_mime,
        nome: a.nome || 'anexo'
      }
    });

    const created = await prisma.consultaAnexo.createMany({
      data: attachmentsToSave
    })

    logger.info('Anexos salvos com sucesso no banco', { consultaId, count: created.count, pacienteId: user.pacienteId })
    return reply.send({ ok: true, count: created.count })
  } catch (err: any) {
    logger.error('Erro ao salvar anexos no banco', err, { consultaId })
    return reply.code(500).send({ error: 'internal_error', message: 'Erro ao salvar os arquivos no banco de dados.' })
  }
}

/**
 * Lista todos os anexos de uma consulta (Metadados apenas)
 * GET /consultas/:id/anexos
 */
export async function listarAnexos(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const validation = validateNumericId(req.params.id, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const consultaId = validation.numericId!
  const consulta = await getConsultaById(consultaId)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user = req.user as AuthenticatedUser

  // Verificar permissão
  const isMedicoDaConsulta = user.tipo_usuario === 'medico' && user.medicoId === consulta.medicoId
  const isPacienteDaConsulta = user.tipo_usuario === 'paciente' && user.pacienteId === consulta.pacienteId
  const isAdmin = user.tipo_usuario === 'admin'

  if (!isMedicoDaConsulta && !isPacienteDaConsulta && !isAdmin) {
    return reply.code(403).send({ error: 'forbidden', message: 'Sem permissão para ver os arquivos desta consulta.' })
  }

  // Auditoria (LGPD/CFM)
  await logAuditoria({
    usuarioId: user.id,
    acao: 'LIST_ANEXOS',
    recurso: 'CONSULTA',
    recursoId: consultaId,
    detalhes: `Listagem de anexos da consulta ${consultaId}`,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  })

  try {
    const anexos = await prisma.consultaAnexo.findMany({
      where: { consultaId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        consultaId: true,
        // NÃO selecionamos o campo 'arquivo' aqui por ser pesado
        nome: true,
        tipo_mime: true,
        createdAt: true
      }
    })

    return reply.send(anexos)
  } catch (err: any) {
    logger.error('Erro ao listar anexos', err, { consultaId })
    return reply.code(500).send({ error: 'internal_error', message: 'Erro ao buscar os arquivos.' })
  }
}

/**
 * Obtém o conteúdo de um anexo específico (Binário)
 * GET /consultas/anexos/:id/arquivo
 */
export async function getAnexoConteudo(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const validation = validateNumericId(req.params.id, 'anexo_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const anexoId = validation.numericId!

  try {
    const anexo = await prisma.consultaAnexo.findUnique({
      where: { id: anexoId },
      include: { consulta: true }
    })

    if (!anexo) return reply.code(404).send({ error: 'file_not_found' })

    const user = req.user as AuthenticatedUser
    const isMedico = user.tipo_usuario === 'medico' && user.medicoId === anexo.consulta.medicoId
    const isPaciente = user.tipo_usuario === 'paciente' && user.pacienteId === anexo.consulta.pacienteId
    const isAdmin = user.tipo_usuario === 'admin'

    if (!isMedico && !isPaciente && !isAdmin) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    // Auditoria (LGPD/CFM)
    await logAuditoria({
      usuarioId: user.id,
      acao: 'DOWNLOAD_ANEXO',
      recurso: 'CONSULTA_ANEXO',
      recursoId: anexoId,
      detalhes: `Download do anexo ID: ${anexoId} da consulta ${anexo.consultaId}`,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    })

    reply.type(anexo.tipo_mime)
    return reply.send(anexo.arquivo)
  } catch (err: any) {
    logger.error('Erro ao buscar conteúdo do anexo', err, { anexoId })
    return reply.code(500).send({ error: 'internal_error' })
  }
}

