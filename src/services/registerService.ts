import prisma from '../config/database';
import bcrypt from 'bcrypt';
import ApiError from '../utils/apiError';

export class RegisterService {
  async createUser(email: string, senha: string, tipo_usuario: 'medico' | 'paciente') {
    // Verificar se email já existe
    const existingUser = await prisma.usuario.findUnique({ where: { email } });
    if (existingUser) {
      throw new ApiError('Este email já está registrado. Tente fazer login ou use outro email.', 409, 'EMAIL_ALREADY_EXISTS');
    }

    // Hash da senha
    const senha_hash = await bcrypt.hash(senha, 10);

    try {
      const user = await prisma.usuario.create({
        data: { email, senha_hash, tipo_usuario, registroFull: false }
      });
      return user;
    } catch (error: any) {
      console.error('createUser error:', error);
      throw new ApiError('Erro interno ao registrar usuário. Tente novamente mais tarde.', 500, 'INTERNAL_ERROR', error.message);
    }
  }

  async createPaciente(data: {
    usuario_id: number;
    nome_completo: string;
    data_nascimento: string;
    cpf: string;
    sexo: string;
    numero: number;
    complemento?: string;
    estado_civil: string;
    endereco: string;
    telefone: string;
    responsavel_legal?: string;
    telefone_responsavel?: string;
    convenio?: string;
    numero_carteirinha?: string;
  }) {
    // Verificar se usuario existe e é paciente
    const user = await prisma.usuario.findUnique({ where: { id: data.usuario_id } });
    if (!user) {
      throw new ApiError('Usuário não encontrado. Verifique o ID fornecido.', 404, 'USER_NOT_FOUND');
    }
    if (user.tipo_usuario !== 'paciente') {
      throw new ApiError('Este usuário não é do tipo paciente. Dados pessoais só podem ser registrados para pacientes.', 400, 'INVALID_USER_TYPE');
    }

    // Verificar se paciente já existe
    const existingPaciente = await prisma.paciente.findUnique({ where: { usuario_id: data.usuario_id } });
    if (existingPaciente) {
      throw new ApiError('Dados pessoais já foram registrados para este usuário.', 409, 'PATIENT_ALREADY_EXISTS');
    }

    // Verificar CPF único
    const existingCpf = await prisma.paciente.findUnique({ where: { cpf: data.cpf } });
    if (existingCpf) {
      throw new ApiError('Este CPF já está registrado no sistema.', 409, 'CPF_ALREADY_EXISTS');
    }

    try {
      const paciente = await prisma.paciente.create({
        data: {
          ...data,
          data_nascimento: new Date(data.data_nascimento)
        }
      });

      // Marcar usuário como registro completo
      await prisma.usuario.update({ where: { id: data.usuario_id }, data: { registroFull: true } });

      return paciente;
    } catch (error: any) {
      console.error('createPaciente error:', error);
      throw new ApiError('Erro interno ao registrar dados pessoais. Tente novamente mais tarde.', 500, 'INTERNAL_ERROR', error.message);
    }
  }

  async createMedico(data: {
    usuario_id: number;
    nome_completo: string;
    data_nascimento: string;
    cpf: string;
    sexo?: string;
    crm: string;
    diploma_url?: string;
    especializacao_url?: string;
    assinatura_digital_url?: string;
    seguro_responsabilidade_url?: string;
  }) {
    // Verificar se usuario existe e é medico
    const user = await prisma.usuario.findUnique({ where: { id: data.usuario_id } });
    if (!user) {
      throw new ApiError('Usuário não encontrado. Verifique o ID fornecido.', 404, 'USER_NOT_FOUND');
    }
    if (user.tipo_usuario !== 'medico') {
      throw new ApiError('Este usuário não é do tipo médico. Dados pessoais só podem ser registrados para médicos.', 400, 'INVALID_USER_TYPE');
    }

    // Verificar se medico já existe
    const existingMedico = await prisma.medico.findUnique({ where: { usuario_id: data.usuario_id } });
    if (existingMedico) {
      throw new ApiError('Dados pessoais já foram registrados para este médico.', 409, 'MEDIC_ALREADY_EXISTS');
    }

    // Verificar CPF único
    const existingCpf = await prisma.medico.findUnique({ where: { cpf: data.cpf } });
    if (existingCpf) {
      throw new ApiError('Este CPF já está registrado no sistema.', 409, 'CPF_ALREADY_EXISTS');
    }

    try {
      const medico = await prisma.medico.create({
        data: {
          ...data,
          data_nascimento: new Date(data.data_nascimento)
        }
      });

      // Marcar usuário como registro completo
      await prisma.usuario.update({ where: { id: data.usuario_id }, data: { registroFull: true } });

      return medico;
    } catch (error: any) {
      console.error('createMedico error:', error);
      throw new ApiError('Erro interno ao registrar dados do médico. Tente novamente mais tarde.', 500, 'INTERNAL_ERROR', error.message);
    }
  }


  async getUsuarioById(id: number) {
    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      throw new ApiError('Usuário não encontrado.', 404, 'USER_NOT_FOUND');
    }
    return usuario;
  }
}