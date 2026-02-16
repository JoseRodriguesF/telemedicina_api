import prisma from '../config/database'
import ApiError from '../utils/apiError'
import logger from '../utils/logger'

export interface DadosHistoriaClinica {
    queixa_principal?: string
    descricao_sintomas?: string
    historico_pessoal?: any
    antecedentes_familiares?: any
    estilo_vida?: any
    vacinacao?: string
    conteudo: string
}

export class HistoriaClinicaService {
    /**
     * Cria uma nova história clínica a partir dos dados da triagem
     */
    async criarHistoriaClinica(
        pacienteId: number,
        dados: DadosHistoriaClinica
    ) {
        try {
            // Verificar se o paciente existe
            const paciente = await prisma.paciente.findUnique({
                where: { id: pacienteId }
            })

            if (!paciente) {
                throw new ApiError('Paciente não encontrado', 404, 'PATIENT_NOT_FOUND')
            }


            const historiaClinica = await prisma.historiaClinica.create({
                data: {
                    pacienteId,
                    queixaPrincipal: dados.queixa_principal ?? "",
                    descricaoSintomas: dados.descricao_sintomas ?? "",
                    historicoPessoal: {
                        ...(typeof dados.historico_pessoal === 'object' ? dados.historico_pessoal : { original: dados.historico_pessoal }),
                        vacinacao: dados.vacinacao
                    } as any,
                    antecedentesFamiliares: dados.antecedentes_familiares ?? {},
                    estiloVida: dados.estilo_vida ?? {},
                    conteudo: dados.conteudo,
                    status: 'completo'
                }
            })

            // Buscar todas as histórias clínicas para gerar o mix consolidado
            const todasHistorias = await prisma.historiaClinica.findMany({
                where: { pacienteId },
                orderBy: { createdAt: 'asc' }
            });

            const resumoConsolidado = this.gerarResumoConsolidado(todasHistorias);

            await prisma.paciente.update({
                where: { id: pacienteId },
                data: {
                    historiaClinicaResumo: resumoConsolidado
                }
            })

            logger.info(`História clínica criada e perfil atualizado com mix consolidado`, {
                historiaClinicaId: historiaClinica.id,
                pacienteId
            })

            return historiaClinica
        } catch (error) {
            if (error instanceof ApiError) throw error
            logger.error('Erro ao criar história clínica', error as Error, { pacienteId })
            throw new ApiError('Erro ao salvar história clínica', 500, 'CREATE_HISTORIA_ERROR')
        }
    }

    /**
     * Gera um texto consolidado unificando os dados de todas as triagens
     */
    private gerarResumoConsolidado(historias: any[]): string {
        let historicoPessoal: string[] = [];
        let antecedentesFamiliares: string[] = [];
        let estiloVida: string[] = [];
        let vacinacao: string[] = [];

        historias.forEach(h => {
            // Extrair de historicoPessoal
            if (h.historicoPessoal) {
                const hp = h.historicoPessoal;
                if (hp.doencas) {
                    if (Array.isArray(hp.doencas)) historicoPessoal.push(...hp.doencas);
                    else historicoPessoal.push(hp.doencas);
                }
                if (hp.alergias) {
                    const alergias = Array.isArray(hp.alergias) ? hp.alergias : [hp.alergias];
                    alergias.forEach((a: string) => {
                        if (a && !/nenhuma|não tem/i.test(a)) historicoPessoal.push(`Alergia: ${a}`);
                    });
                }
                if (hp.medicamentos) {
                    const medicamentos = Array.isArray(hp.medicamentos) ? hp.medicamentos : [hp.medicamentos];
                    medicamentos.forEach((m: string) => {
                        if (m && !/nenhum|não toma/i.test(m)) historicoPessoal.push(`Medicamento: ${m}`);
                    });
                }
                if (hp.vacinacao && !vacinacao.includes(hp.vacinacao) && !/não informad|pendente/i.test(hp.vacinacao)) {
                    vacinacao.push(hp.vacinacao);
                }
            }

            // Antecedentes Familiares
            if (h.antecedentesFamiliares) {
                const af = h.antecedentesFamiliares;
                if (typeof af === 'object') {
                    Object.entries(af).forEach(([key, val]) => {
                        if (val && typeof val === 'string' && !/nenhum|não tem|nega|nada/i.test(val)) {
                            antecedentesFamiliares.push(`${key}: ${val}`);
                        }
                    });
                } else if (typeof af === 'string' && af.trim() && !/nenhum|nada/i.test(af)) {
                    antecedentesFamiliares.push(af);
                }
            }

            // Estilo de Vida
            if (h.estiloVida) {
                const ev = h.estiloVida;
                if (typeof ev === 'object') {
                    Object.entries(ev).forEach(([key, val]) => {
                        if (val && typeof val === 'string' && !/não informado|sem dados/i.test(val)) {
                            estiloVida.push(`${key}: ${val}`);
                        }
                    });
                } else if (typeof ev === 'string' && ev.trim()) {
                    estiloVida.push(ev);
                }
            }
        });

        // Helper para limpar e unificar de forma inteligente
        const clean = (arr: string[]) => {
            const uniqueItems = Array.from(new Set(arr)).filter(s => s && s.length > 2);

            // Se houver algum item que NÃO seja "nenhuma/não informado", removemos os itens que são "nenhuma/não informado"
            const relevantItems = uniqueItems.filter(i => !/^(nenhuma|nenhum|não informado|nega|sem dados|nada)\.?$/i.test(i.trim()));

            if (relevantItems.length > 0) {
                return relevantItems.map(i => `- ${i}`).join('\n');
            }

            // Se só tiver "nenhuma", retorna o primeiro "nenhuma" encontrado
            return uniqueItems.length > 0 ? (uniqueItems[0].includes('Nega') ? uniqueItems[0] : `- ${uniqueItems[0]}`) : 'Sem dados registrados';
        };

        const ultima = historias[historias.length - 1];

        const sections = [
            { label: '### **1. QUEIXA PRINCIPAL DA ÚLTIMA TRIAGEM**', content: ultima?.queixaPrincipal },
            { label: '### **2. HISTÓRICO DA QUEIXA / DETALHES DO PEDIDO**', content: ultima?.descricaoSintomas },
            { label: '### **3. HISTÓRICO MÉDICO PESSOAL (CONSOLIDADO)**', content: clean(historicoPessoal) },
            { label: '### **4. ANTECEDENTES FAMILIARES (CONSOLIDADO)**', content: clean(antecedentesFamiliares) },
            { label: '### **5. ESTILO DE VIDA (CONSOLIDADO)**', content: clean(estiloVida) },
            { label: '### **6. VACINAÇÃO**', content: clean(vacinacao) }
        ];


        const report = sections
            .filter(s => s.content)
            .map(s => `${s.label}\n${s.content}`)
            .join('\n\n');

        return `# **PRONTUÁRIO CONSOLIDADO DO PACIENTE**\n*Relatório gerado automaticamente integrando todo o histórico de triagens*\n\n---\n\n${report}`;
    }




    /**
     * Busca todas as histórias clínicas de um paciente
     */
    async buscarHistoriaPorPaciente(pacienteId: number) {
        try {
            const historias = await prisma.historiaClinica.findMany({
                where: { pacienteId },
                orderBy: { createdAt: 'desc' },
                include: {
                    paciente: {
                        select: {
                            id: true,
                            nome_completo: true
                        }
                    }
                }
            })

            return historias
        } catch (error) {
            logger.error('Erro ao buscar história clínica', error as Error, { pacienteId })
            throw new ApiError('Erro ao buscar história clínica', 500, 'FETCH_HISTORIA_ERROR')
        }
    }

    /**
     * Busca a última versão da história clínica de um paciente
     */
    async buscarUltimaHistoria(pacienteId: number) {
        try {
            const historia = await prisma.historiaClinica.findFirst({
                where: { pacienteId },
                orderBy: { createdAt: 'desc' },
                include: {
                    paciente: {
                        select: {
                            id: true,
                            nome_completo: true
                        }
                    }
                }
            })

            return historia
        } catch (error) {
            logger.error('Erro ao buscar última história clínica', error as Error, { pacienteId })
            throw new ApiError('Erro ao buscar história clínica', 500, 'FETCH_HISTORIA_ERROR')
        }
    }

    /**
     * Busca uma história clínica específica por ID
     */
    async buscarHistoriaPorId(id: number) {
        try {
            const historia = await prisma.historiaClinica.findUnique({
                where: { id },
                include: {
                    paciente: {
                        select: {
                            id: true,
                            nome_completo: true,
                            data_nascimento: true,
                            sexo: true
                        }
                    }
                }
            })

            if (!historia) {
                throw new ApiError('História clínica não encontrada', 404, 'HISTORIA_NOT_FOUND')
            }

            return historia
        } catch (error) {
            if (error instanceof ApiError) throw error
            logger.error('Erro ao buscar história clínica por ID', error as Error, { id })
            throw new ApiError('Erro ao buscar história clínica', 500, 'FETCH_HISTORIA_ERROR')
        }
    }
}
