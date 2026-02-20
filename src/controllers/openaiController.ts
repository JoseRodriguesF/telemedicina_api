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

/**
 * Valida e sanitiza os dados estruturados retornados pela IA
 */
function normalizarCamelCaseParaSnake(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj
  if (typeof obj !== 'object') return obj
  const map: Record<string, string> = {
    queixaPrincipal: 'queixa_principal',
    descricaoSintomas: 'descricao_sintomas',
    historicoPessoal: 'historico_pessoal',
    antecedentesFamiliares: 'antecedentes_familiares',
    estiloVida: 'estilo_vida',
    vacinacao: 'vacinacao'
  }
  const out: any = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = map[k] || k
    out[key] = typeof v === 'object' && v !== null && !Array.isArray(v) ? normalizarCamelCaseParaSnake(v) : v
  }
  return out
}

function validarESanitizarDados(dados: any): any {
  if (!dados || typeof dados !== 'object') {
    throw new Error('Dados estruturados inválidos')
  }

  dados = normalizarCamelCaseParaSnake(dados)

  // Garantir que historico_pessoal seja um objeto com arrays
  if (dados.historico_pessoal) {
    const hp = dados.historico_pessoal

    // Garantir que doencas seja array
    if (hp.doencas && !Array.isArray(hp.doencas)) {
      hp.doencas = typeof hp.doencas === 'string' ? [hp.doencas] : []
    } else if (!hp.doencas) {
      hp.doencas = []
    }

    // Garantir que medicamentos seja array
    if (hp.medicamentos && !Array.isArray(hp.medicamentos)) {
      hp.medicamentos = typeof hp.medicamentos === 'string' ? [hp.medicamentos] : []
    } else if (!hp.medicamentos) {
      hp.medicamentos = []
    }

    // Garantir que alergias seja array
    if (hp.alergias && !Array.isArray(hp.alergias)) {
      hp.alergias = typeof hp.alergias === 'string' ? [hp.alergias] : []
    } else if (!hp.alergias) {
      hp.alergias = []
    }

    // Filtrar valores null, undefined ou vazios
    hp.doencas = hp.doencas.filter((d: any) => d && typeof d === 'string' && d.trim())
    hp.medicamentos = hp.medicamentos.filter((m: any) => m && typeof m === 'string' && m.trim())
    hp.alergias = hp.alergias.filter((a: any) => a && typeof a === 'string' && a.trim())
  } else {
    dados.historico_pessoal = { doencas: [], medicamentos: [], alergias: [] }
  }

  // Garantir que antecedentes_familiares seja objeto
  if (!dados.antecedentes_familiares || typeof dados.antecedentes_familiares !== 'object') {
    dados.antecedentes_familiares = {}
  }

  // Garantir que estilo_vida seja objeto
  if (!dados.estilo_vida || typeof dados.estilo_vida !== 'object') {
    dados.estilo_vida = {}
  }

  // Garantir que conteudo exista e seja string
  if (!dados.conteudo || typeof dados.conteudo !== 'string') {
    throw new Error('Campo conteudo é obrigatório')
  }

  return dados
}

/**
 * Formata o resumo do histórico clínico para incluir no contexto da IA
 */
function formatarContextoHistorico(resumo: string | null): string {
  if (!resumo || resumo.trim() === '') {
    return 'Este é o primeiro atendimento do paciente. Nenhum histórico médico registrado anteriormente.'
  }

  return `IMPORTANTE: O paciente já possui o seguinte histórico médico registrado em atendimentos anteriores:\n\n${resumo}\n\nVocê PODE usar essas informações como referência, mas SEMPRE confirme com o paciente se houve mudanças. NÃO presuma que tudo permanece igual.`
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

    const user = req.user
    if (!user || !user.id) {
      return reply.code(401).send({ error: 'usuário_não_autenticado' })
    }

    // Buscar nome do paciente e histórico clínico se o usuário for paciente
    let nomePaciente: string | null = null
    let pacienteId: number | null = null
    let contextoHistorico: string = ''

    if (user.tipo_usuario === 'paciente') {
      const paciente = await prisma.paciente.findUnique({
        where: { usuario_id: user.id },
        select: {
          id: true,
          nome_completo: true,
          historiaClinicaResumo: true
        }
      })

      if (paciente) {
        nomePaciente = paciente.nome_completo
        pacienteId = paciente.id
        contextoHistorico = formatarContextoHistorico(paciente.historiaClinicaResumo)
      }
    }

    // Chamar OpenAI com contexto histórico
    const { answer, completed, dadosEstruturados } = await chatWithOpenAI(
      message,
      nomePaciente,
      history || [],
      contextoHistorico
    )

    // Se a triagem foi concluída e temos dados estruturados, salvar no banco
    if (completed && dadosEstruturados && pacienteId) {
      try {
        // Validar e sanitizar dados antes de salvar
        const dadosValidados = validarESanitizarDados(dadosEstruturados)

        const historiaClinica = await historiaService.criarHistoriaClinica(
          pacienteId,
          dadosValidados
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
        // Log detalhado do erro
        logger.error('Erro ao salvar história clínica automaticamente', err as Error, {
          pacienteId,
          usuarioId: user.id,
          dadosEstruturados: JSON.stringify(dadosEstruturados)
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
