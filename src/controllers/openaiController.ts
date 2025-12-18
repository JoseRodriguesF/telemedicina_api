import { FastifyReply, FastifyRequest } from 'fastify'
import { chatWithOpenAI } from '../services/openaiService'
import prisma from '../config/database'

import { ChatMessage } from '../services/openaiService'

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
    if (user.tipo_usuario === 'paciente') {
      const paciente = await prisma.paciente.findUnique({ 
        where: { usuario_id: user.id } 
      })
      nomePaciente = paciente?.nome_completo || null
    }

    const { answer, completed } = await chatWithOpenAI(message, nomePaciente, history || [])

    return reply.send({ answer, completed })
  } catch (err: any) {
    console.error('Erro ao chamar OpenAI:', err)
    return reply.code(500).send({ error: 'erro_ao_chamar_openai' })
  }
}
