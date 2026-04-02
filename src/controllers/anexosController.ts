import { FastifyReply, FastifyRequest } from 'fastify'
import prisma from '../config/database'
import logger from '../utils/logger'
import { validateNumericId } from '../utils/controllerHelpers'
import { AuthenticatedUser } from '../types/shared'
import { getConsultaById } from '../services/consultasService'
import { logAuditoria } from '../utils/auditLogger'
import { encrypt, decrypt } from '../utils/encryption'

/**
 * Validação de Magic Bytes (Assinatura de arquivo)
 * Previne upload de executáveis disfarçados de PDF/IMG.
 */
function isValidMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'application/pdf') {
    return buffer.slice(0, 4).toString() === '%PDF'
  }
  if (mimeType.startsWith('image/')) {
    // JPEG: FF D8 FF
    if (mimeType === 'image/jpeg') return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF
    // PNG: 89 50 4E 47
    if (mimeType === 'image/png') return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47
  }
  return true // Outros tipos sob risco controlado
}

/**
 * Salva uma lista de anexos (arquivos do paciente) vinculados a uma consulta
 */
export async function salvarAnexos(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const validation = validateNumericId(req.params.id, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const consultaId = validation.numericId!
  const consulta = await getConsultaById(consultaId)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user = req.user as AuthenticatedUser

  if (user.tipo_usuario !== 'paciente' || user.pacienteId !== consulta.pacienteId) {
    return reply.code(403).send({ error: 'forbidden', message: 'Apenas o paciente da consulta pode enviar arquivos.' })
  }

  const body = (req.body as any) || {}
  const anexos: Array<{ data: string; nome?: string; tipo_mime: string }> = Array.isArray(body.anexos) ? body.anexos : []

  if (anexos.length === 0) {
    return reply.code(400).send({ error: 'no_anexos', message: 'Nenhum arquivo foi enviado.' })
  }

  try {
    const attachmentsToSave = anexos.map(a => {
      const base64Clean = a.data.includes('base64,') ? a.data.split('base64,')[1] : a.data;
      const buffer = Buffer.from(base64Clean, 'base64')
      
      // OWASP: Validação de integridade do arquivo
      if (!isValidMagicBytes(buffer, a.tipo_mime)) {
        throw new Error(`Arquivo inválido detectado: ${a.nome}`)
      }

      // LGPD: Criptografia do buffer binário antes de persistir no DB
      const encryptedBuffer = encrypt(buffer)

      return {
        consultaId,
        arquivo: Buffer.from(encryptedBuffer, 'utf8'), // O buffer criptografado é uma string hex formatada
        tipo_mime: a.tipo_mime,
        nome: a.nome || 'anexo'
      }
    });

    const created = await prisma.consultaAnexo.createMany({
      data: attachmentsToSave
    })

    logger.info('Anexos criptografados e salvos com sucesso', { consultaId, count: created.count })
    return reply.send({ ok: true, count: created.count })
  } catch (err: any) {
    logger.error('Erro ao salvar anexos', err)
    return reply.code(400).send({ error: 'security_validation_failed', message: err.message })
  }
}

/**
 * Lista todos os anexos de uma consulta (Metadados apenas)
 */
export async function listarAnexos(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const validation = validateNumericId(req.params.id, 'consulta_id')
  if (!validation.valid) return reply.code(400).send(validation.error!)

  const consultaId = validation.numericId!
  const consulta = await getConsultaById(consultaId)
  if (!consulta) return reply.code(404).send({ error: 'consulta_not_found' })

  const user = req.user as AuthenticatedUser
  const isAuthorized = (user.tipo_usuario === 'medico' && user.medicoId === consulta.medicoId) ||
                       (user.tipo_usuario === 'paciente' && user.pacienteId === consulta.pacienteId) ||
                       (user.tipo_usuario === 'admin')

  if (!isAuthorized) return reply.code(403).send({ error: 'forbidden' })

  await logAuditoria({
    usuarioId: user.id,
    acao: 'LIST_ANEXOS',
    recurso: 'CONSULTA',
    recursoId: consultaId,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  })

  const anexos = await prisma.consultaAnexo.findMany({
    where: { consultaId },
    select: { id: true, consultaId: true, nome: true, tipo_mime: true, createdAt: true }
  })

  return reply.send(anexos)
}

/**
 * Obtém o conteúdo de um anexo específico (Binário Descriptografado)
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
    const isAuthorized = (user.tipo_usuario === 'medico' && user.medicoId === anexo.consulta.medicoId) ||
                         (user.tipo_usuario === 'paciente' && user.pacienteId === anexo.consulta.pacienteId) ||
                         (user.tipo_usuario === 'admin')

    if (!isAuthorized) return reply.code(403).send({ error: 'forbidden' })

    // Descriptografia do buffer para retorno ao cliente
    const encryptedString = Buffer.from(anexo.arquivo).toString('utf8')
    const decryptedBuffer = decrypt(encryptedString, true) as Buffer

    await logAuditoria({
      usuarioId: user.id,
      acao: 'DOWNLOAD_ANEXO',
      recurso: 'CONSULTA_ANEXO',
      recursoId: anexoId,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    })

    reply.type(anexo.tipo_mime)
    return reply.send(decryptedBuffer)
  } catch (err: any) {
    logger.error('Erro no download do anexo', err)
    return reply.code(500).send({ error: 'decryption_failed' })
  }
}

