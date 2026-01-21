import { FastifyReply, FastifyRequest } from 'fastify'
import { chatWithOpenAI } from '../services/openaiService'
import prisma from '../config/database'
import { ChatMessage } from '../services/openaiService'
import logger from '../utils/logger'
import { HistoriaClinicaService } from '../services/historiaClinicaService'

const historiaService = new HistoriaClinicaService()

interface ChatBody {
  message: string
  history?: ChatMessage[] // Histórico opcional enviado pelo frontend
}

export async function openaiChatController(req: FastifyRequest<{ Body: ChatBody }>, reply: FastifyReply) {
  try {
    const { message, history = [] } = req.body

    if (!message || typeof message !== 'string') {
      return reply.code(400).send({ error: 'message é obrigatório e deve ser string' })
    }

    // Validar formato do histórico se fornecido
    if (history && (!Array.isArray(history) || !history.every(m => m.role && m.content))) {
      return reply.code(400).send({ error: 'history deve ser um array de mensagens com role e content' })
    }

    const user: any = (req as any).user
    if (!user || !user.id) {
      return reply.code(401).send({ error: 'usuário_não_autenticado' })
    }

    // Buscar nome do paciente se o usuário for paciente
    let nomePaciente: string | null = null
    let pacienteId: number | null = null
    if (user.tipo_usuario === 'paciente') {
      const paciente = await prisma.paciente.findUnique({
        where: { usuario_id: user.id }
      })
      nomePaciente = paciente?.nome_completo || null
      pacienteId = paciente?.id || null
    }

    const { answer, completed, dadosEstruturados } = await chatWithOpenAI(message, nomePaciente, history || [])

    // Se a triagem foi concluída e temos dados estruturados, salvar no banco
    if (completed && dadosEstruturados && pacienteId) {
      try {
        const historiaClinica = await historiaService.criarHistoriaClinica(
          pacienteId,
          user.id,
          dadosEstruturados
        )

        logger.info('História clínica salva automaticamente', {
          historiaClinicaId: historiaClinica.id,
          pacienteId,
          usuarioId: user.id
        })

        return reply.send({
          answer,
          completed,
          historiaClinicaSalva: true,
          historiaClinicaId: historiaClinica.id
        })
      } catch (err) {
        // Log do erro mas não falha a resposta do chat
        logger.error('Erro ao salvar história clínica automaticamente', err as Error, {
          pacienteId,
          usuarioId: user.id
        })

        // Retornar resposta mesmo que falhe ao salvar
        return reply.send({
          answer,
          completed,
          historiaClinicaSalva: false,
          erro: 'Erro ao salvar história clínica'
        })
      }
    }

    return reply.send({ answer, completed })
  } catch (err: any) {
    logger.error('Failed to call OpenAI API', err, {
      userId: (req as any).user?.id,
      messageLength: req.body.message?.length
    })
    return reply.code(500).send({ error: 'erro_ao_chamar_openai' })
  }
}
