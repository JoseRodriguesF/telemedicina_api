import { FastifyReply, FastifyRequest } from 'fastify'
import { chatWithOpenAI } from '../services/openaiService'
import prisma from '../config/database'

interface ChatBody {
  message: string
}

export async function openaiChatController(req: FastifyRequest<{ Body: ChatBody }>, reply: FastifyReply) {
  try {
    const { message } = req.body

    if (!message || typeof message !== 'string') {
      return reply.code(400).send({ error: 'message é obrigatório e deve ser string' })
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

    const { answer } = await chatWithOpenAI(user.id, message, nomePaciente)

    // Histórico é mantido apenas no servidor para contexto da IA
    return reply.send({ answer })
  } catch (err: any) {
    console.error('Erro ao chamar OpenAI:', err)
    return reply.code(500).send({ error: 'erro_ao_chamar_openai' })
  }
}
