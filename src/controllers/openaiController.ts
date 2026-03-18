import { FastifyReply, FastifyRequest } from 'fastify'
import { chatWithOpenAI } from '../services/openaiService'
import prisma from '../config/database'
import { ChatMessage } from '../services/openaiService'
import logger from '../utils/logger'
import { HistoriaClinicaService } from '../services/historiaClinicaService'

const historiaService = new HistoriaClinicaService()

interface ChatBody {
  message: string
  history?: ChatMessage[]
  tipoConsulta?: string
}

interface ConfirmTriagemBody {
  dadosEstruturados: any
}

/**
 * Normaliza chaves camelCase para snake_case nos dados da IA
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

  if (dados.historico_pessoal) {
    const hp = dados.historico_pessoal

    if (hp.doencas && !Array.isArray(hp.doencas)) {
      hp.doencas = typeof hp.doencas === 'string' ? [hp.doencas] : []
    } else if (!hp.doencas) {
      hp.doencas = []
    }

    if (hp.medicamentos && !Array.isArray(hp.medicamentos)) {
      hp.medicamentos = typeof hp.medicamentos === 'string' ? [hp.medicamentos] : []
    } else if (!hp.medicamentos) {
      hp.medicamentos = []
    }

    if (hp.alergias && !Array.isArray(hp.alergias)) {
      hp.alergias = typeof hp.alergias === 'string' ? [hp.alergias] : []
    } else if (!hp.alergias) {
      hp.alergias = []
    }

    hp.doencas = hp.doencas.filter((d: any) => d && typeof d === 'string' && d.trim())
    hp.medicamentos = hp.medicamentos.filter((m: any) => m && typeof m === 'string' && m.trim())
    hp.alergias = hp.alergias.filter((a: any) => a && typeof a === 'string' && a.trim())
  } else {
    dados.historico_pessoal = { doencas: [], medicamentos: [], alergias: [] }
  }

  if (!dados.antecedentes_familiares || typeof dados.antecedentes_familiares !== 'object') {
    dados.antecedentes_familiares = {}
  }

  if (!dados.estilo_vida || typeof dados.estilo_vida !== 'object') {
    dados.estilo_vida = {}
  }

  const rawConteudo = dados.conteudo
  if (rawConteudo == null || (typeof rawConteudo !== 'string' && typeof rawConteudo !== 'number') || String(rawConteudo).trim() === '') {
    // Fallback caso a IA esqueça o conteúdo estruturado
    dados.conteudo = `### **TRIAGEM CONCLUÍDA**\n\n**Queixa Principal:** ${dados.queixa_principal || 'Não informada'}\n**Sintomas:** ${dados.descricao_sintomas || 'Não informados'}`
  } else {
    dados.conteudo = String(rawConteudo).trim()
  }

  return dados
}

function formatarContextoHistorico(resumo: string | null): string {
  if (!resumo || resumo.trim() === '') {
    return 'Este é o primeiro atendimento do paciente. Nenhum histórico médico registrado anteriormente.'
  }
  return `IMPORTANTE: O paciente já possui o seguinte histórico médico registrado em atendimentos anteriores:\n\n${resumo}\n\nVocê PODE usar essas informações como referência, mas SEMPRE confirme com o paciente se houve mudanças. NÃO presuma que tudo permanece igual.`
}

/**
 * Endpoint principal de chat com a IA de triagem.
 * Quando a triagem é concluída, retorna os dados estruturados para confirmação
 * do paciente — NÃO salva automaticamente no banco.
 */
export async function openaiChatController(req: FastifyRequest<{ Body: ChatBody }>, reply: FastifyReply) {
  try {
    const { message, history = [], tipoConsulta = 'pronto atendimento' } = req.body

    if (!message || typeof message !== 'string') {
      return reply.code(400).send({ error: 'message é obrigatório e deve ser string' })
    }

    if (history && (!Array.isArray(history) || !history.every(m => m.role && m.content))) {
      return reply.code(400).send({ error: 'history deve ser um array de mensagens com role e content' })
    }

    const user = req.user
    if (!user || !user.id) {
      return reply.code(401).send({ error: 'usuário_não_autenticado' })
    }

    let nomePaciente: string | null = null
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
        contextoHistorico = formatarContextoHistorico(paciente.historiaClinicaResumo)
      }
    }

    const { answer, completed, dadosEstruturados } = await chatWithOpenAI(
      message,
      nomePaciente,
      history || [],
      contextoHistorico,
      tipoConsulta
    )

    // Triagem concluída: retornar dados para confirmação do paciente.
    // O salvamento só ocorre após confirmação via POST /chat-ia/confirmar
    if (completed && dadosEstruturados) {
      try {
        const dadosValidados = validarESanitizarDados(dadosEstruturados)
        return reply.send({
          answer,
          completed,
          dadosEstruturados: dadosValidados,
          historiaClinicaSalva: false,
          aguardandoConfirmacao: true
        })
      } catch (err) {
        logger.error('Erro ao validar dados estruturados da triagem', err as Error, { userId: user.id })
        return reply.send({
          answer,
          completed,
          historiaClinicaSalva: false,
          erro: 'Erro ao processar dados da triagem'
        })
      }
    }

    // Triagem ainda em andamento
    if (completed && !dadosEstruturados) {
      logger.error('[ERRO CRÍTICO] Triagem concluída mas o JSON não foi detectado/parseado corretamente.', new Error('JSON não detectado'), { userId: user.id })
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

/**
 * Confirma a triagem e salva a história clínica no banco de dados.
 * Chamado pelo frontend APÓS o paciente revisar e aprovar o relatório gerado.
 */
export async function confirmTriagemController(req: FastifyRequest<{ Body: ConfirmTriagemBody }>, reply: FastifyReply) {
  try {
    const user = req.user
    if (!user || !user.id) {
      return reply.code(401).send({ error: 'usuário_não_autenticado' })
    }

    if (user.tipo_usuario !== 'paciente') {
      return reply.code(403).send({ error: 'apenas_pacientes_podem_confirmar_triagem' })
    }

    const { dadosEstruturados } = req.body
    if (!dadosEstruturados) {
      return reply.code(400).send({ error: 'dadosEstruturados é obrigatório' })
    }

    const paciente = await prisma.paciente.findUnique({
      where: { usuario_id: user.id },
      select: { id: true }
    })

    if (!paciente) {
      return reply.code(404).send({ error: 'paciente_nao_encontrado' })
    }

    const dadosValidados = validarESanitizarDados(dadosEstruturados)
    const historiaClinica = await historiaService.criarHistoriaClinica(paciente.id, dadosValidados)

    logger.info('História clínica salva após confirmação do paciente', {
      historiaClinicaId: historiaClinica.id,
      pacienteId: paciente.id,
      usuarioId: user.id
    })

    return reply.send({
      ok: true,
      historiaClinicaSalva: true,
      historiaClinicaId: historiaClinica.id
    })
  } catch (err: any) {
    logger.error('Erro ao confirmar triagem', err, { userId: (req as any).user?.id })
    return reply.code(500).send({ error: 'erro_ao_confirmar_triagem' })
  }
}
