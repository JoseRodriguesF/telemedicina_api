import { FastifyRequest, FastifyReply } from 'fastify';
import { LoginService } from '../services/loginService';
import { z } from 'zod';
import ApiError from '../utils/apiError';

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
      // Incluir `registro_full` também no nível raiz para garantir que o frontend o veja facilmente
      reply.send({ message: 'Login realizado com sucesso', user: result, registro_full: result.registro_full });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'Dados inválidos', details: error.issues } });
      } else if (error instanceof ApiError) {
        reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details, payload: error.payload } });
      } else {
        reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente mais tarde.' } });
      }
    }
  }
}