import { FastifyRequest, FastifyReply } from 'fastify';
import { GoogleAuthService } from '../services/googleAuthService';
import { z } from 'zod';
import ApiError from '../utils/apiError';

const googleService = new GoogleAuthService();

const googleSchema = z.object({
  id_token: z.string().min(1, 'id_token é obrigatório'),
  tipo_usuario: z.enum(['medico', 'paciente']).optional()
});

export class GoogleController {
  async auth(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id_token, tipo_usuario } = googleSchema.parse(request.body);
      const result = await googleService.loginWithGoogle(id_token);
      reply.send({ message: 'Login via Google realizado com sucesso', user: result });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'Dados inválidos', details: error.issues } });
      } else if (error instanceof ApiError) {
        reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details } });
      } else {
        reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente mais tarde.' } });
      }
    }
  }

  async register(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id_token, tipo_usuario } = googleSchema.parse(request.body);
      const tipo = tipo_usuario ?? 'paciente';
      const result = await googleService.registerWithGoogle(id_token, tipo);
      reply.send({ message: 'Registro via Google realizado com sucesso', user: result });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'Dados inválidos', details: error.issues } });
      } else if (error instanceof ApiError) {
        reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details } });
      } else {
        reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente mais tarde.' } });
      }
    }
  }
}
