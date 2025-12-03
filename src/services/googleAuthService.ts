import { OAuth2Client } from 'google-auth-library';
import prisma from '../config/database';
import jwt from 'jsonwebtoken';
import ApiError from '../utils/apiError';

export class GoogleAuthService {
  private client: OAuth2Client;

  constructor() {
    this.client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  async loginWithGoogle(idToken: string) {
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      if (!payload) throw new ApiError('Token inválido do Google', 401, 'INVALID_GOOGLE_TOKEN');

      const googleId = payload['sub'];
      if (!googleId) throw new ApiError('Dados do Google incompletos', 400, 'MISSING_GOOGLE_DATA');

      // Login: somente com google_id (não vinculamos automaticamente por email aqui)
      const user = await prisma.usuario.findUnique({ where: { google_id: googleId } as any });
      if (!user) {
        throw new ApiError('No user linked to this Google account', 404, 'USER_NOT_FOUND');
      }

      const token = jwt.sign({ id: user.id, email: user.email, tipo_usuario: user.tipo_usuario }, process.env.JWT_SECRET!, { expiresIn: '7d' });

      // Carregar nome/verificacao
      let nome: string | undefined;
      let verificacao: string | undefined;
      if (user.tipo_usuario === 'medico') {
        const medico = await prisma.medico.findUnique({ where: { usuario_id: user.id } });
        nome = (medico as any)?.nome_completo;
        verificacao = (medico as any)?.verificacao;
      } else if (user.tipo_usuario === 'paciente') {
        const paciente = await prisma.paciente.findUnique({ where: { usuario_id: user.id } });
        nome = (paciente as any)?.nome_completo;
      }

      return {
        id: user.id,
        email: user.email,
        tipo_usuario: user.tipo_usuario,
        registro_full: (user as any).registroFull ?? false,
        token,
        nome,
        verificacao
      };
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      throw new ApiError('Failed to verify Google token', 401, 'INVALID_GOOGLE_TOKEN', err?.message);
    }
  }

  async registerWithGoogle(idToken: string, tipo_usuario: 'medico' | 'paciente') {
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      if (!payload) throw new ApiError('Token inválido do Google', 401, 'INVALID_GOOGLE_TOKEN');

      const googleId = payload['sub'];
      const email = payload['email'];
      if (!googleId || !email) throw new ApiError('Dados do Google incompletos', 400, 'MISSING_GOOGLE_DATA');

      // Se já existir usuário com google_id ou email, não criar
      const existingByGoogle = await prisma.usuario.findUnique({ where: { google_id: googleId } as any });
      if (existingByGoogle) throw new ApiError('Conta Google já cadastrada. Faça login.', 409, 'GOOGLE_ALREADY_REGISTERED');

      const existingByEmail = await prisma.usuario.findUnique({ where: { email } });
      if (existingByEmail) throw new ApiError('Já existe um usuário com este email. Faça login ou vincule a conta.', 409, 'EMAIL_ALREADY_EXISTS');

      const user = await prisma.usuario.create({
        data: {
          email,
          google_id: googleId,
          tipo_usuario,
          registroFull: false
        }
      });

      const token = jwt.sign({ id: user.id, email: user.email, tipo_usuario: user.tipo_usuario }, process.env.JWT_SECRET!, { expiresIn: '7d' });

      // Tentar obter nome se já existir registro pessoal (normalmente será null neste momento)
      let nome: string | undefined;
      if (user.tipo_usuario === 'medico') {
        const medico = await prisma.medico.findUnique({ where: { usuario_id: user.id } });
        nome = (medico as any)?.nome_completo;
      } else if (user.tipo_usuario === 'paciente') {
        const paciente = await prisma.paciente.findUnique({ where: { usuario_id: user.id } });
        nome = (paciente as any)?.nome_completo;
      }

      return {
        id: user.id,
        email: user.email,
        tipo_usuario: user.tipo_usuario,
        registro_full: (user as any).registroFull ?? false,
        token,
        nome
      };
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      throw new ApiError('Failed to verify Google token', 401, 'INVALID_GOOGLE_TOKEN', err?.message);
    }
  }
}
