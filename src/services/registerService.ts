import prisma from '../config/database';
import bcrypt from 'bcrypt';

export class RegisterService {
  async createUser(email: string, senha: string, tipo_usuario: 'medico' | 'paciente') {
    // Verificar se email já existe
    const existingUser = await prisma.usuario.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error('Email já cadastrado');
    }

    // Hash da senha
    const senha_hash = await bcrypt.hash(senha, 10);

    const user = await prisma.usuario.create({
      data: { email, senha_hash, tipo_usuario }
    });

    return user;
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
    if (!user || user.tipo_usuario !== 'paciente') {
      throw new Error('Usuário inválido ou não é paciente');
    }

    // Verificar se paciente já existe
    const existingPaciente = await prisma.paciente.findUnique({ where: { usuario_id: data.usuario_id } });
    if (existingPaciente) {
      throw new Error('Dados pessoais já cadastrados');
    }

    const paciente = await prisma.paciente.create({
      data: {
        ...data,
        data_nascimento: new Date(data.data_nascimento)
      }
    });

    return paciente;
  }
}