import { FastifyRequest, FastifyReply } from 'fastify';
import { LoginService } from '../services/loginService';
import { z } from 'zod';

const loginService = new LoginService();

// Schema de validação com Zod
const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  senha: z.string().min(1, 'Senha é obrigatória')
});

export class LoginController {
  async login(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { email, senha } = loginSchema.parse(request.body);
      const user = await loginService.authenticateUser(email, senha);
      reply.send({ message: 'Login realizado com sucesso', user });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        reply.code(400).send({ error: 'Dados inválidos', details: error.issues });
      } else {
        const statusCode = error.statusCode || 500;
        reply.code(statusCode).send({ error: error.message });
      }
    }
  }
}