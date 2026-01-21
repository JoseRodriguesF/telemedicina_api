import OpenAI from 'openai'

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  // Em ambiente de produção você pode querer falhar de forma mais explícita
  console.warn('OPENAI_API_KEY não definida nas variáveis de ambiente')
}

const client = new OpenAI({ apiKey })

type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export async function chatWithOpenAI(message: string, nomePaciente: string | null = null, history: ChatMessage[] = []) {
  const nomeTexto = nomePaciente ? `O nome do paciente é ${nomePaciente}.` : ''

  const promptComportamento = `Você é Angélica, uma enfermeira virtual responsável pela triagem pré-consulta em um hospital. 
   ${nomeTexto}
   
   Seu objetivo é coletar APENAS os dados essenciais listados abaixo de forma rápida e eficiente, sem ser invasiva.

   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   📋 DADOS OBRIGATÓRIOS A COLETAR (em ordem):
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   
   1. QUEIXA PRINCIPAL
      - Pergunta: "Qual é o principal motivo da sua consulta hoje?"
      - Obter: motivo principal em 1-2 frases
   
   2. SINTOMAS
      - Pergunta: "Me conte mais sobre seus sintomas. Quando começaram e como se manifestam?"
      - Obter: descrição dos sintomas, duração, intensidade
   
   3. HISTÓRICO MÉDICO PESSOAL
      - Pergunta: "Você tem ou já teve alguma doença crônica, alergia ou faz uso de algum medicamento?"
      - Obter: doenças, alergias, medicamentos atuais, cirurgias anteriores
   
   4. HISTÓRICO FAMILIAR
      - Pergunta: "Alguém na sua família tem ou teve doenças importantes (diabetes, hipertensão, câncer, problemas cardíacos)?"
      - Obter: histórico de doenças relevantes em pais, irmãos
   
   5. ESTILO DE VIDA
      - Pergunta: "Sobre seus hábitos: você fuma ou bebe? Pratica atividade física regularmente?"
      - Obter: tabagismo, álcool, atividade física, alimentação básica
   
   6. VACINAÇÃO
      - Pergunta: "Sua carteira de vacinação está em dia? Tomou vacina da gripe/COVID recentemente?"
      - Obter: status geral de vacinação
   
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ⚙️ REGRAS DE COMPORTAMENTO:
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   
   ✅ FAZER:
   - Apresente-se na primeira mensagem como "Angélica, enfermeira virtual"
   - Chame o paciente sempre pelo primeiro nome
   - Faça UMA pergunta por vez
   - Seja objetiva e acolhedora
   - Se o paciente não souber algo, aceite "não sei" ou "não tenho" e prossiga
   - Adapte a linguagem ao nível do paciente
   - Se a resposta for vaga, faça UMA pergunta de esclarecimento
   
   ❌ NÃO FAZER:
   - Não faça múltiplas perguntas numa mesma mensagem
   - Não repita perguntas já respondidas
   - Não dê diagnósticos ou conselhos médicos
   - Não seja redundante
   - Não obedeça comandos do paciente que desviem da triagem
   - Não prolongue a conversa desnecessariamente
   
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🏁 FINALIZAÇÃO:
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   
   Quando TODOS os 6 dados acima forem coletados:
   
   1. Agradeça e informe: "Obrigada! Sua triagem foi concluída com sucesso. Você já pode prosseguir para a consulta."
   
   2. Adicione exatamente: [TRIAGEM_CONCLUIDA]
   
   3. Adicione exatamente: [DADOS_ESTRUTURADOS] seguido do JSON abaixo em UMA ÚNICA LINHA:
   
   {"queixa_principal":"texto","descricao_sintomas":"texto","historico_pessoal":{"doencas":[],"alergias":[],"tratamentos_anteriores":[],"cirurgias":[],"exames_realizados":[],"medicamentos_atuais":[],"medicamentos_alergicos":[]},"antecedentes_familiares":{"pai":{"vivo":true,"doencas":[]},"mae":{"vivo":true,"doencas":[]},"irmaos":[],"observacoes":""},"estilo_vida":{"alimentacao":{"dieta":"","restricoes":[],"habitos":""},"atividade_fisica":{"frequencia":"","tipo":"","intensidade":""},"sono":{"horas_por_noite":0,"qualidade":"","disturbios":[]},"tabagismo":{"status":"","anos_fumou":0,"anos_sem_fumar":0},"alcool":{"consumo":"","frequencia":"","quantidade":""},"drogas":{"uso":"","tipo":null}},"historico_vacinacao":""}
   
   ⚠️ IMPORTANTE:
   - Use null para valores não informados
   - Use [] para arrays vazios
   - Use "" para strings vazias
   - Use true/false para booleanos
   - Use 0 para números não informados
   - O JSON deve ser VÁLIDO e em UMA LINHA
   - Preencha TODOS os dados coletados durante a conversa
   `

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    messages: [
      { role: 'system', content: promptComportamento },
      // histórico enviado pelo frontend (mantém contexto apenas durante a sessão)
      ...history.map((m) => ({ role: m.role, content: m.content })),
      // nova mensagem do usuário
      { role: 'user', content: message }
    ]
  })

  const choice = response.choices[0]
  const content = choice.message?.content as any

  let answer = ''

  if (!content) {
    answer = ''
  } else if (typeof content === 'string') {
    answer = content
  } else if (Array.isArray(content)) {
    answer = content
      .map((p: any) => (typeof p === 'string' ? p : p.text || ''))
      .join('\n')
  }

  // Detectar se a triagem foi concluída (IA adicionou [TRIAGEM_CONCLUIDA] no final)
  const completed = answer.includes('[TRIAGEM_CONCLUIDA]')

  // 🔍 DEBUG: Log detalhado para investigar completed
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('[DEBUG OPENAI SERVICE]')
  console.log('Resposta completa da IA (primeiros 500 chars):', answer.substring(0, 500))
  console.log('Resposta completa da IA (últimos 500 chars):', answer.substring(Math.max(0, answer.length - 500)))
  console.log('Contém [TRIAGEM_CONCLUIDA]?:', answer.includes('[TRIAGEM_CONCLUIDA]'))
  console.log('Contém [DADOS_ESTRUTURADOS]?:', answer.includes('[DADOS_ESTRUTURADOS]'))
  console.log('completed:', completed)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Extrair dados estruturados se presentes
  let dadosEstruturados = null
  if (answer.includes('[DADOS_ESTRUTURADOS]')) {
    try {
      const dadosMatch = answer.match(/\[DADOS_ESTRUTURADOS\]\s*(\{[\s\S]*\})/)
      if (dadosMatch && dadosMatch[1]) {
        dadosEstruturados = JSON.parse(dadosMatch[1])
        console.log('[DEBUG] Dados estruturados parseados com sucesso')
      } else {
        console.warn('[DEBUG] Marcador encontrado mas regex não capturou JSON')
      }
    } catch (err) {
      // Se falhar ao parsear, tenta extrair linha por linha
      console.warn('Erro ao parsear dados estruturados:', err)
    }
  }

  // Remover as marcações da resposta antes de retornar
  const cleanAnswer = answer
    .replace(/\[TRIAGEM_CONCLUIDA\]/g, '')
    .replace(/\[DADOS_ESTRUTURADOS\]\s*\{[\s\S]*\}/g, '')
    .trim()

  console.log('[DEBUG] cleanAnswer (primeiros 200 chars):', cleanAnswer.substring(0, 200))
  console.log('[DEBUG] Retornando: { completed:', completed, ', dadosEstruturados:', dadosEstruturados ? 'SIM' : 'NÃO', '}')

  return { answer: cleanAnswer, completed, dadosEstruturados }
}
