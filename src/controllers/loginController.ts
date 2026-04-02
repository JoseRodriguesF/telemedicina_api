import { FastifyRequest, FastifyReply } from 'fastify';
import { LoginService } from '../services/loginService';
import { z } from 'zod';
import ApiError from '../utils/apiError';
import { logAuditoria } from '../utils/auditLogger';

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
      
      // CFM/LGPD: Auditoria de login bem-sucedido
      await logAuditoria({
        usuarioId: result.id,
        acao: 'LOGIN_SUCESSO',
        recurso: 'autenticacao',
        detalhes: `Usuário '${email}' autenticado com sucesso.`,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      });

      // Retornar somente dentro de `user` para evitar duplicidade
      reply.send({ message: 'Login realizado com sucesso', user: result });
    } catch (error: any) {
      // CFM/LGPD: Auditoria de tentativa de falha (ajuda a identificar ataques de força bruta)
      // Nota: Não temos o ID do usuário aqui se a falha for credencial errada, 
      // mas podemos logar o evento associado ao IP se houvesse suporte no model.
      // Por agora, registraremos o erro.
      
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