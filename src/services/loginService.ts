import prisma from '../config/database';
import bcrypt from 'bcrypt';

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

    // Retornar dados do usuário (sem senha)
    return {
      id: user.id,
      email: user.email,
      tipo_usuario: user.tipo_usuario
    };
  }
}