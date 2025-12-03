import prisma from '../config/database';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import ApiError from '../utils/apiError';

export class LoginService {
  async authenticateUser(email: string, senha: string) {
    // Buscar usuário por email
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user) {
      throw new ApiError('Usuário com este email não foi encontrado.', 404, 'USER_NOT_FOUND');
    }

    // Verificar senha
    // Se a conta não tem senha (usuário criado/vinculado via OAuth), indicar uso do login OAuth
    if (!user.senha_hash) {
      throw new ApiError('Esta conta está vinculada ao Google. Faça login usando o Google.', 401, 'USE_GOOGLE_AUTH');
    }

    const isPasswordValid = await bcrypt.compare(senha, user.senha_hash);
    if (!isPasswordValid) {
      throw new ApiError('Senha incorreta. Verifique sua senha e tente novamente.', 401, 'WRONG_PASSWORD');
    }

    // Recarregar usuário para garantir que o campo registroFull esteja presente
    const usuarioCompleto = await prisma.usuario.findUnique({ where: { id: user.id } });
    // compatibilidade: check both mapped camelCase and original snake_case if types differ
    const registroFullValue = (usuarioCompleto as any)?.registroFull ?? (usuarioCompleto as any)?.registro_full ?? false;

    // Obter nome do usuário (paciente/medico) e verificação (se médico)
    let verificacao: string | undefined;
    let nome: string | undefined;
    if (user.tipo_usuario === 'medico') {
      const medico = await prisma.medico.findUnique({ where: { usuario_id: user.id } });
      verificacao = (medico as any)?.verificacao;
      nome = (medico as any)?.nome_completo;
    } else if (user.tipo_usuario === 'paciente') {
      const paciente = await prisma.paciente.findUnique({ where: { usuario_id: user.id } });
      nome = (paciente as any)?.nome_completo;
    }

    // Gerar JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, tipo_usuario: user.tipo_usuario },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' } // Expira em 7 dias
    );

    // Retornar dados do usuário, token e flag registro_full (snake_case no payload)
    return {
      id: user.id,
      email: user.email,
      tipo_usuario: user.tipo_usuario,
      registro_full: registroFullValue,
      nome,
      verificacao,
      token
    };
  }
}