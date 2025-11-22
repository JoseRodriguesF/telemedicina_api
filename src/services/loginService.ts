import prisma from '../config/database';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export class LoginService {
  async authenticateUser(email: string, senha: string) {
    // Buscar usuário por email
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user) {
      const error = new Error('Credenciais inválidas. Verifique seu email e senha.');
      (error as any).statusCode = 401; // Unauthorized
      throw error;
    }

    // Verificar senha
    const isPasswordValid = await bcrypt.compare(senha, user.senha_hash);
    if (!isPasswordValid) {
      const error = new Error('Credenciais inválidas. Verifique seu email e senha.');
      (error as any).statusCode = 401; // Unauthorized
      throw error;
    }

    // Recarregar usuário para garantir que o campo registroFull esteja presente
    const usuarioCompleto = await prisma.usuario.findUnique({ where: { id: user.id } });
    // compatibilidade: check both mapped camelCase and original snake_case if types differ
    const registroFullValue = (usuarioCompleto as any)?.registroFull ?? (usuarioCompleto as any)?.registro_full ?? false;

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
      token
    };
  }
}