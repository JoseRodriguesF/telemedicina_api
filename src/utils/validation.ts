import { z } from 'zod'

/**
 * Schemas de validação centralizados usando Zod
 * Evita duplicação e garante consistência em toda a API
 */

// ============= SCHEMAS DE CONSULTA =============

export const endConsultaSchema = z.object({
    hora_fim: z.string().optional(),
    repouso: z.string().optional(),
    destino_final: z.string().optional(),
    diagnostico: z.string().optional(),
    evolucao: z.string().optional(),
    plano_terapeutico: z.string().optional()
})

export const avaliarConsultaSchema = z.object({
    estrelas: z.number().int().min(1).max(5),
    avaliacao: z.string().optional()
}).refine(
    (data) => data.estrelas === 5 || (data.avaliacao && data.avaliacao.trim().length > 0),
    {
        message: 'Justificativa é obrigatória para avaliações menores que 5 estrelas',
        path: ['avaliacao']
    }
)

export const agendarConsultaSchema = z.object({
    medico_id: z.number().int().positive().optional().nullable(),
    paciente_id: z.number().int().positive(),
    data_consulta: z.string().refine((date) => !isNaN(Date.parse(date)), {
        message: 'Data de consulta inválida'
    }).optional(),
    hora_inicio: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/, {
        message: 'Hora de início inválida. Use formato HH:MM ou HH:MM:SS'
    }).optional(),
    hora_fim: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/, {
        message: 'Hora de fim inválida. Use formato HH:MM ou HH:MM:SS'
    }).optional(),
    historiaClinicaId: z.number().int().positive().optional()
})

export const joinRoomSchema = z.object({
    userId: z.union([z.string(), z.number()]),
    role: z.enum(['medico', 'paciente']).optional()
})

// ============= SCHEMAS DE HISTÓRIA CLÍNICA =============

export const createHistoriaClinicaSchema = z.object({
    pacienteId: z.number().int().positive(),
    conteudo: z.string().min(1, 'O conteúdo da história clínica é obrigatório'),
    status: z.enum(['rascunho', 'finalizado', 'completo']).default('rascunho')
})

export const updateHistoriaClinicaSchema = createHistoriaClinicaSchema.partial()

// ============= SCHEMAS DE REGISTRO =============

export const registerAccessSchema = z.object({
    email: z.string().email('Email inválido'),
    senha: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
    tipo_usuario: z.enum(['medico', 'paciente'])
})

export const registerPersonalSchema = z.object({
    usuario_id: z.number().int().positive('ID do usuário deve ser um número positivo'),
    nome_completo: z.string().min(1, 'Nome completo é obrigatório'),
    data_nascimento: z.string().refine((date) => !isNaN(Date.parse(date)), 'Data de nascimento inválida'),
    cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos numéricos'),
    sexo: z.string().min(1, 'Sexo é obrigatório'),
    estado_civil: z.string().min(1, 'Estado civil é obrigatório'),
    telefone: z.string().regex(/^\d{10,11}$/, 'Telefone deve ter 10 ou 11 dígitos'),
    responsavel_legal: z.string().nullish(),
    telefone_responsavel: z.string().nullish(),
    endereco: z.object({
        endereco: z.string().min(1, 'Endereço é obrigatório'),
        numero: z.number().int().nonnegative('Número inválido'),
        complemento: z.string().nullish()
    })
})

export const registerMedicoSchema = z.object({
    usuario_id: z.number().int().positive('ID do usuário deve ser um número positivo'),
    nome_completo: z.string().min(1, 'Nome completo é obrigatório'),
    data_nascimento: z.string().refine((date) => !isNaN(Date.parse(date)), 'Data de nascimento inválida'),
    cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos numéricos'),
    sexo: z.string().min(1, 'Sexo é obrigatório'),
    crm: z.string().min(1, 'CRM é obrigatório'),
    diploma_url: z.string().url('URL do diploma inválida'),
    especializacao_url: z.string().url('URL do diploma de especialista inválida').nullish(),
    assinatura_digital_url: z.string().url('URL da assinatura digital inválida'),
    seguro_responsabilidade_url: z.string().url('URL do seguro de responsabilidade inválida')
})

// ============= SCHEMAS DE LOGIN =============

export const loginSchema = z.object({
    email: z.string().email('Email inválido'),
    senha: z.string().min(1, 'Senha é obrigatória')
})

export const googleAuthSchema = z.object({
    credential: z.string().min(1, 'Credential do Google é obrigatório'),
    tipo_usuario: z.enum(['medico', 'paciente']).optional()
})

// ============= SCHEMAS DE PERFIL =============

export const updatePerfilPacienteSchema = z.object({
    nome_completo: z.string().min(1).optional(),
    data_nascimento: z.string().refine((date) => !isNaN(Date.parse(date))).optional(),
    sexo: z.string().optional(),
    estado_civil: z.string().optional(),
    telefone: z.string().regex(/^\d{10,11}$/).optional(),
    responsavel_legal: z.string().nullish(),
    telefone_responsavel: z.string().nullish()
})

export const updatePerfilMedicoSchema = z.object({
    nome_completo: z.string().min(1).optional(),
    data_nascimento: z.string().refine((date) => !isNaN(Date.parse(date))).optional(),
    sexo: z.string().optional(),
    crm: z.string().optional(),
    diploma_url: z.string().url().optional(),
    especializacao_url: z.string().url().nullish(),
    assinatura_digital_url: z.string().url().optional(),
    seguro_responsabilidade_url: z.string().url().optional()
})

export const updateEnderecoSchema = z.object({
    endereco: z.string().min(1).optional(),
    numero: z.number().int().nonnegative().optional(),
    complemento: z.string().nullish()
})

// ============= TIPOS INFERIDOS =============

export type EndConsultaInput = z.infer<typeof endConsultaSchema>
export type AvaliarConsultaInput = z.infer<typeof avaliarConsultaSchema>
export type AgendarConsultaInput = z.infer<typeof agendarConsultaSchema>
export type JoinRoomInput = z.infer<typeof joinRoomSchema>
export type CreateHistoriaClinicaInput = z.infer<typeof createHistoriaClinicaSchema>
export type UpdateHistoriaClinicaInput = z.infer<typeof updateHistoriaClinicaSchema>
export type RegisterAccessInput = z.infer<typeof registerAccessSchema>
export type RegisterPersonalInput = z.infer<typeof registerPersonalSchema>
export type RegisterMedicoInput = z.infer<typeof registerMedicoSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>
export type UpdatePerfilPacienteInput = z.infer<typeof updatePerfilPacienteSchema>
export type UpdatePerfilMedicoInput = z.infer<typeof updatePerfilMedicoSchema>
export type UpdateEnderecoInput = z.infer<typeof updateEnderecoSchema>
