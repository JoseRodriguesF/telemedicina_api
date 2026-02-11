import prisma from '../config/database'
import bcrypt from 'bcrypt'
import ApiError from '../utils/apiError'
import { validateCPF, sanitizeCPF, sanitizePhone, sanitizeText, validateBirthDate } from '../utils/security'
import logger from '../utils/logger'

export class RegisterService {
  async createUser(email: string, senha: string, tipo_usuario: 'medico' | 'paciente') {
    // Verificar se email já existe
    const existingUser = await prisma.usuario.findUnique({ where: { email } })
    if (existingUser) {
      logger.warn('Attempted registration with existing email', { email: logger.sanitize({ email }) })
      throw new ApiError('Este email já está registrado. Tente fazer login ou use outro email.', 409, 'EMAIL_ALREADY_EXISTS')
    }

    // Hash da senha com salt adequado
    const senha_hash = await bcrypt.hash(senha, 12) // 12 rounds para melhor segurança

    try {
      const user = await prisma.usuario.create({
        data: { email, senha_hash, tipo_usuario, registroFull: false }
      })

      logger.info('User created successfully', { userId: user.id, tipo_usuario })
      return user
    } catch (error: any) {
      logger.error('Failed to create user', error, { tipo_usuario })
      throw new ApiError('Erro interno ao registrar usuário. Tente novamente mais tarde.', 500, 'INTERNAL_ERROR')
    }
  }

  async createPaciente(data: {
    usuario_id: number
    nome_completo: string
    data_nascimento: string
    cpf: string
    sexo: string
    estado_civil: string
    telefone: string
    responsavel_legal?: string | null
    telefone_responsavel?: string | null
    endereco?: { endereco: string; numero: string; complemento?: string | null }
  }) {
    // Verificar se usuario existe e é paciente
    const user = await prisma.usuario.findUnique({ where: { id: data.usuario_id } })
    if (!user) {
      throw new ApiError('Usuário não encontrado. Verifique o ID fornecido.', 404, 'USER_NOT_FOUND')
    }
    if (user.tipo_usuario !== 'paciente') {
      throw new ApiError('Este usuário não é do tipo paciente. Dados pessoais só podem ser registrados para pacientes.', 400, 'INVALID_USER_TYPE')
    }

    // Verificar se paciente já existe
    const existingPaciente = await prisma.paciente.findUnique({ where: { usuario_id: data.usuario_id } })
    if (existingPaciente) {
      throw new ApiError('Dados pessoais já foram registrados para este usuário.', 409, 'PATIENT_ALREADY_EXISTS')
    }

    // Validar e sanitizar CPF
    const cleanCPF = sanitizeCPF(data.cpf)
    if (!validateCPF(cleanCPF)) {
      throw new ApiError('CPF inválido. Verifique os dígitos e tente novamente.', 400, 'INVALID_CPF')
    }

    // Verificar CPF único
    const existingCpf = await prisma.paciente.findUnique({ where: { cpf: cleanCPF } })
    if (existingCpf) {
      logger.warn('Attempted registration with existing CPF', { usuario_id: data.usuario_id })
      throw new ApiError('Este CPF já está registrado no sistema.', 409, 'CPF_ALREADY_EXISTS')
    }

    // Validar data de nascimento
    const birthDateValidation = validateBirthDate(data.data_nascimento)
    if (!birthDateValidation.valid) {
      throw new ApiError(birthDateValidation.error!, 400, 'INVALID_BIRTH_DATE')
    }

    // Sanitizar dados de texto
    const nome_completo = sanitizeText(data.nome_completo)
    const telefone = sanitizePhone(data.telefone)
    const responsavel_legal = data.responsavel_legal ? sanitizeText(data.responsavel_legal) : null
    const telefone_responsavel = data.telefone_responsavel ? sanitizePhone(data.telefone_responsavel) : null

    try {
      const paciente = await prisma.paciente.create({
        data: {
          usuario_id: data.usuario_id,
          nome_completo,
          data_nascimento: new Date(data.data_nascimento),
          cpf: cleanCPF,
          sexo: data.sexo,
          estado_civil: data.estado_civil,
          telefone,
          responsavel_legal,
          telefone_responsavel
        }
      })

      // Marcar usuário como registro completo
      await prisma.usuario.update({ where: { id: data.usuario_id }, data: { registroFull: true } })

      logger.info('Patient created successfully', { pacienteId: paciente.id })
      return paciente
    } catch (error: any) {
      logger.error('Failed to create patient', error, { usuario_id: data.usuario_id })
      throw new ApiError('Erro interno ao registrar dados pessoais. Tente novamente mais tarde.', 500, 'INTERNAL_ERROR')
    }
  }

  async createEndereco(data: { usuario_id: number; endereco: string; numero: string; complemento?: string | null }) {
    const endereco = sanitizeText(data.endereco)
    const complemento = data.complemento ? sanitizeText(data.complemento) : null

    try {
      const result = await prisma.endereco.create({
        data: {
          usuario_id: data.usuario_id,
          endereco,
          numero: String(data.numero) as any,
          complemento
        }
      })

      logger.info('Address created successfully', { usuario_id: data.usuario_id })
      return result
    } catch (error: any) {
      logger.error('Failed to create address', error, { usuario_id: data.usuario_id })
      throw new ApiError('Erro interno ao registrar endereço. Tente novamente mais tarde.', 500, 'INTERNAL_ERROR')
    }
  }

  async createMedico(data: {
    usuario_id: number
    nome_completo: string
    data_nascimento: string
    cpf: string
    sexo: string
    crm: string
    diploma: { data: string; mimetype: string }
    especializacao?: { data: string; mimetype: string } | null
    assinatura_digital: { data: string; mimetype: string }
    seguro_responsabilidade: { data: string; mimetype: string }
  }) {
    // Verificar se usuario existe e é medico
    const user = await prisma.usuario.findUnique({ where: { id: data.usuario_id } })
    if (!user) {
      throw new ApiError('Usuário não encontrado. Verifique o ID fornecido.', 404, 'USER_NOT_FOUND')
    }
    if (user.tipo_usuario !== 'medico') {
      throw new ApiError('Este usuário não é do tipo médico. Dados pessoais só podem ser registrados para médicos.', 400, 'INVALID_USER_TYPE')
    }

    // Verificar se medico já existe
    const existingMedico = await prisma.medico.findUnique({ where: { usuario_id: data.usuario_id } })
    if (existingMedico) {
      throw new ApiError('Dados pessoais já foram registrados para este médico.', 409, 'MEDIC_ALREADY_EXISTS')
    }

    // Validar e sanitizar CPF
    const cleanCPF = sanitizeCPF(data.cpf)
    if (!validateCPF(cleanCPF)) {
      throw new ApiError('CPF inválido. Verifique os dígitos e tente novamente.', 400, 'INVALID_CPF')
    }

    // Verificar CPF único
    const existingCpf = await prisma.medico.findUnique({ where: { cpf: cleanCPF } })
    if (existingCpf) {
      logger.warn('Attempted registration with existing CPF', { usuario_id: data.usuario_id })
      throw new ApiError('Este CPF já está registrado no sistema.', 409, 'CPF_ALREADY_EXISTS')
    }

    // Validar data de nascimento
    const birthDateValidation = validateBirthDate(data.data_nascimento)
    if (!birthDateValidation.valid) {
      throw new ApiError(birthDateValidation.error!, 400, 'INVALID_BIRTH_DATE')
    }

    // Sanitizar dados de texto
    const nome_completo = sanitizeText(data.nome_completo)

    try {
      const medico = await prisma.medico.create({
        data: {
          usuario_id: data.usuario_id,
          nome_completo,
          data_nascimento: new Date(data.data_nascimento),
          cpf: cleanCPF,
          sexo: data.sexo,
          crm: data.crm,
          // Documentos Binários
          diploma_data: Buffer.from(data.diploma.data, 'base64'),
          diploma_mimetype: data.diploma.mimetype,

          especializacao_data: data.especializacao ? Buffer.from(data.especializacao.data, 'base64') : null,
          especializacao_mimetype: data.especializacao ? data.especializacao.mimetype : null,

          assinatura_digital_data: Buffer.from(data.assinatura_digital.data, 'base64'),
          assinatura_digital_mimetype: data.assinatura_digital.mimetype,

          seguro_responsabilidade_data: Buffer.from(data.seguro_responsabilidade.data, 'base64'),
          seguro_responsabilidade_mimetype: data.seguro_responsabilidade.mimetype
        }
      })

      // Marcar usuário como registro completo
      await prisma.usuario.update({ where: { id: data.usuario_id }, data: { registroFull: true } })

      logger.info('Doctor created successfully', { medicoId: medico.id })
      return medico
    } catch (error: any) {
      logger.error('Failed to create doctor', error, { usuario_id: data.usuario_id })
      throw new ApiError('Erro interno ao registrar dados do médico. Tente novamente mais tarde.', 500, 'INTERNAL_ERROR')
    }
  }

  async getUsuarioById(id: number) {
    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        tipo_usuario: true,
        registroFull: true
      }
    })

    if (!usuario) {
      throw new ApiError('Usuário não encontrado.', 404, 'USER_NOT_FOUND')
    }

    return usuario
  }
}