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
      const result = await loginService.authenticateUser(email, senha);
      reply.send({ message: 'Login realizado com sucesso', user: result });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        reply.code(400).send({ error: 'Dados inválidos', details: error.issues });
      } else {
        const statusCode = error.statusCode || 500;
        // Se o service adicionou payload (ex: userId quando cadastro incompleto), inclua no retorno
        if (error.payload) {
          reply.code(statusCode).send({ error: error.message, payload: error.payload });
        } else {
          reply.code(statusCode).send({ error: error.message });
        }
      }
    }
  }
}