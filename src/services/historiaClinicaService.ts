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
     * Gera um texto consolidado unificando dados permanentes (sem queixa principal e sintomas)
     */
    private gerarResumoConsolidado(historias: any[]): string {
        const doencas = new Map<string, string>(); // normalized -> original
        const alergias = new Map<string, string>();
        const medicamentos = new Map<string, string>();
        const antecedentesFamiliares = new Map<string, Set<string>>();
        const estiloVidaMap = new Map<string, Set<string>>();
        const vacinacao = new Set<string>();

        historias.forEach(h => {
            // Extrair de historicoPessoal
            if (h.historicoPessoal) {
                const hp = h.historicoPessoal;

                // Doenças
                if (hp.doencas) {
                    const list = Array.isArray(hp.doencas) ? hp.doencas : [hp.doencas];
                    list.forEach((d: string) => {
                        if (typeof d === 'string') {
                            const clean = this.normalizeText(d);
                            if (clean && !this.isNegative(clean)) {
                                const normalized = this.normalizeForComparison(clean);
                                // Só adiciona se não existir uma variação similar
                                if (!this.hasSimilarKey(doencas, normalized)) {
                                    doencas.set(normalized, this.capitalizeProper(clean));
                                }
                            }
                        }
                    });
                }

                // Alergias
                if (hp.alergias) {
                    const list = Array.isArray(hp.alergias) ? hp.alergias : [hp.alergias];
                    list.forEach((a: string) => {
                        if (typeof a === 'string') {
                            const clean = this.normalizeText(a);
                            if (clean && !this.isNegative(clean)) {
                                const normalized = this.normalizeForComparison(clean);
                                if (!this.hasSimilarKey(alergias, normalized)) {
                                    alergias.set(normalized, this.capitalizeProper(clean));
                                }
                            }
                        }
                    });
                }

                // Medicamentos
                if (hp.medicamentos) {
                    const list = Array.isArray(hp.medicamentos) ? hp.medicamentos : [hp.medicamentos];
                    list.forEach((m: string) => {
                        if (typeof m === 'string') {
                            const clean = this.normalizeText(m);
                            if (clean && !this.isNegative(clean)) {
                                const normalized = this.normalizeForComparison(clean);
                                if (!this.hasSimilarKey(medicamentos, normalized)) {
                                    medicamentos.set(normalized, this.capitalizeProper(clean));
                                }
                            }
                        }
                    });
                }

                // Vacinação
                if (hp.vacinacao) {
                    const clean = this.normalizeText(hp.vacinacao);
                    if (clean && !this.isNegative(clean) && clean.toLowerCase() !== 'não coletado nesta triagem') {
                        vacinacao.add(clean);
                    }
                }
            }

            // Antecedentes Familiares
            if (h.antecedentesFamiliares) {
                const af = h.antecedentesFamiliares;
                if (typeof af === 'object' && !Array.isArray(af)) {
                    Object.entries(af).forEach(([key, val]) => {
                        if (val && typeof val === 'string') {
                            const cleanKey = this.normalizeFieldName(key);
                            const cleanVal = this.normalizeText(val as string);
                            if (cleanVal && !this.isNegative(cleanVal) && cleanVal.toLowerCase() !== 'nenhuma doença relevante relatada') {
                                if (!antecedentesFamiliares.has(cleanKey)) {
                                    antecedentesFamiliares.set(cleanKey, new Set());
                                }
                                antecedentesFamiliares.get(cleanKey)!.add(this.capitalizeProper(cleanVal));
                            }
                        }
                    });
                } else if (typeof af === 'string') {
                    const clean = this.normalizeText(af);
                    if (clean && !this.isNegative(clean) && clean.toLowerCase() !== 'nenhuma doença relevante relatada') {
                        if (!antecedentesFamiliares.has('Família')) {
                            antecedentesFamiliares.set('Família', new Set());
                        }
                        antecedentesFamiliares.get('Família')!.add(this.capitalizeProper(clean));
                    }
                }
            }

            // Estilo de Vida (normalizar nomes de campos)
            if (h.estiloVida) {
                const ev = h.estiloVida;
                if (typeof ev === 'object' && !Array.isArray(ev)) {
                    Object.entries(ev).forEach(([key, val]) => {
                        if (val && typeof val === 'string') {
                            const normalizedKey = this.normalizeFieldName(key);
                            const cleanVal = this.normalizeText(val as string);
                            if (cleanVal && !this.isNegative(cleanVal) && cleanVal.toLowerCase() !== 'não coletado nesta triagem') {
                                if (!estiloVidaMap.has(normalizedKey)) {
                                    estiloVidaMap.set(normalizedKey, new Set());
                                }
                                estiloVidaMap.get(normalizedKey)!.add(this.capitalizeProper(cleanVal));
                            }
                        }
                    });
                } else if (typeof ev === 'string') {
                    const clean = this.normalizeText(ev);
                    if (clean && !this.isNegative(clean) && clean.toLowerCase() !== 'não coletado nesta triagem') {
                        if (!estiloVidaMap.has('Geral')) {
                            estiloVidaMap.set('Geral', new Set());
                        }
                        estiloVidaMap.get('Geral')!.add(this.capitalizeProper(clean));
                    }
                }
            }
        });

        // Montar o texto final em formato markdown profissional
        let resumo = '';

        if (doencas.size > 0 || alergias.size > 0 || medicamentos.size > 0) {
            resumo += '### **HISTÓRICO MÉDICO PESSOAL**\n\n';
            if (doencas.size > 0) {
                resumo += `**Doenças crônicas:** ${Array.from(doencas.values()).join(', ')}\n\n`;
            }
            if (medicamentos.size > 0) {
                resumo += `**Medicamentos:** ${Array.from(medicamentos.values()).join(', ')}\n\n`;
            }
            if (alergias.size > 0) {
                resumo += `**Alergias:** ${Array.from(alergias.values()).join(', ')}\n\n`;
            }
        }

        if (antecedentesFamiliares.size > 0) {
            resumo += '### **ANTECEDENTES FAMILIARES**\n\n';
            antecedentesFamiliares.forEach((values, key) => {
                resumo += `**${key}:** ${Array.from(values).join(', ')}\n\n`;
            });
        }

        if (estiloVidaMap.size > 0) {
            resumo += '### **ESTILO DE VIDA**\n\n';
            estiloVidaMap.forEach((values, key) => {
                resumo += `**${key}:** ${Array.from(values).join(', ')}\n\n`;
            });
        }

        if (vacinacao.size > 0) {
            resumo += '### **VACINAÇÃO**\n\n';
            resumo += `${Array.from(vacinacao).join(', ')}\n\n`;
        }

        return resumo.trim();
    }

    /**
     * Normaliza texto para comparação (remove acentos, pontuação, espaços extras)
     */
    private normalizeForComparison(text: string): string {
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove acentos
            .replace(/[^\w\s]/g, '') // Remove pontuação
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Verifica se já existe uma chave similar no Map (para evitar duplicatas)
     */
    private hasSimilarKey(map: Map<string, string>, key: string): boolean {
        for (const existingKey of map.keys()) {
            if (this.calculateSimilarity(key, existingKey) > 0.8) {
                return true;
            }
        }
        return false;
    }

    /**
     * Calcula similaridade entre duas strings usando Coeficiente de Jaccard
     */
    private calculateSimilarity(str1: string, str2: string): number {
        const set1 = new Set(str1.split(' '));
        const set2 = new Set(str2.split(' '));

        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        return union.size === 0 ? 0 : intersection.size / union.size;
    }

    /**
     * Capitaliza adequadamente nomes de medicamentos e doenças
     */
    private capitalizeProper(text: string): string {
        // Palavras que devem ficar em minúscula (exceto no início)
        const lowercase = ['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o'];

        return text
            .split(' ')
            .map((word, index) => {
                const lower = word.toLowerCase();
                if (index > 0 && lowercase.includes(lower)) {
                    return lower;
                }
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            })
            .join(' ');
    }
    private normalizeFieldName(fieldName: string): string {
        const map: Record<string, string> = {
            'exercicios': 'Atividade física',
            'atividade_fisica': 'Atividade física',
            'atividade_físic': 'Atividade física',
            'atividadefisica': 'Atividade física',
            'atividade física': 'Atividade física',
            'alcool': 'Álcool',
            'álcool': 'Álcool',
            'tabagismo': 'Tabagismo',
            'diabetes': 'Diabetes',
            'diabetes_tipo': 'Diabetes',
            'avô': 'Avô',
            'avó': 'Avó',
            'avo': 'Avô',
            'colesterol_alto': 'Colesterol alto',
            'colesterol alto': 'Colesterol alto',
            'alimentacao': 'Alimentação',
            'alimentação': 'Alimentação',
            'estilo_de_vida': 'Geral'
        };

        const lower = fieldName.toLowerCase().trim().replace(/_/g, ' ');
        return map[lower] || this.capitalizeFirst(lower);
    }

    private capitalizeFirst(text: string): string {
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    /**
     * Normaliza texto removendo espaços extras e prefixos
     */
    private normalizeText(text: string): string {
        if (!text) return '';
        return text.trim()
            .replace(/\s+/g, ' ')
            .replace(/^(Alergia|Medicamento|Doença):\s*/i, '');
    }

    /**
     * Verifica se o texto indica ausência/negação
     */
    private isNegative(text: string): boolean {
        const lower = text.toLowerCase().trim();
        return /^(nenhum(a)?|não (tem|há|possui|usa|toma|informad[oa]|coletado)|nega|sem dados?|n\/?a|nada|ausente|nao tem|nao ha)\.?$/i.test(lower) ||
            lower.length < 2 ||
            lower === 'não coletado nesta triagem' ||
            lower === 'nenhuma doença relevante relatada';
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
