import prisma from '../config/database';
import bcrypt from 'bcrypt';

export class RegisterService {
  async createUser(email: string, senha: string, tipo_usuario: 'medico' | 'paciente') {
    // Verificar se email já existe
    const existingUser = await prisma.usuario.findUnique({ where: { email } });
    if (existingUser) {
      const error = new Error('Este email já está registrado. Tente fazer login ou use outro email.');
      (error as any).statusCode = 409; // Conflict
      throw error;
    }

    // Hash da senha
    const senha_hash = await bcrypt.hash(senha, 10);

    try {
      const user = await prisma.usuario.create({
        data: { email, senha_hash, tipo_usuario }
      });
      return user;
    } catch (error) {
      throw new Error('Erro interno ao registrar usuário. Tente novamente mais tarde.');
    }
  }

  async createPaciente(data: {
    usuario_id: number;
    nome_completo: string;
    data_nascimento: string;
    cpf: string;
    sexo: string;
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
      const error = new Error('Usuário não encontrado. Verifique o ID fornecido.');
      (error as any).statusCode = 404; // Not Found
      throw error;
    }
    if (user.tipo_usuario !== 'paciente') {
      const error = new Error('Este usuário não é do tipo paciente. Dados pessoais só podem ser registrados para pacientes.');
      (error as any).statusCode = 400; // Bad Request
      throw error;
    }

    // Verificar se paciente já existe
    const existingPaciente = await prisma.paciente.findUnique({ where: { usuario_id: data.usuario_id } });
    if (existingPaciente) {
      const error = new Error('Dados pessoais já foram registrados para este usuário.');
      (error as any).statusCode = 409; // Conflict
      throw error;
    }

    // Verificar CPF único
    const existingCpf = await prisma.paciente.findUnique({ where: { cpf: data.cpf } });
    if (existingCpf) {
      const error = new Error('Este CPF já está registrado no sistema.');
      (error as any).statusCode = 409; // Conflict
      throw error;
    }

    try {
      const paciente = await prisma.paciente.create({
        data: {
          ...data,
          data_nascimento: new Date(data.data_nascimento)
        }
      });
      return paciente;
    } catch (error) {
      throw new Error('Erro interno ao registrar dados pessoais. Tente novamente mais tarde.');
    }
  }
}