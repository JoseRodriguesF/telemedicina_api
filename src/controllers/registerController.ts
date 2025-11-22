import { FastifyRequest, FastifyReply } from 'fastify';
import { RegisterService } from '../services/registerService';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import ApiError from '../utils/apiError';

const registerService = new RegisterService();

// Schemas de validação com Zod
const registerAccessSchema = z.object({
  email: z.string().email('Email inválido'),
  senha: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  tipo_usuario: z.enum(['medico', 'paciente'])
});

const registerPersonalSchema = z.object({
  usuario_id: z.number().int().positive('ID do usuário deve ser um número positivo'),
  nome_completo: z.string().min(1, 'Nome completo é obrigatório'),
  data_nascimento: z.string().refine((date) => !isNaN(Date.parse(date)), 'Data de nascimento inválida'),
  cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos numéricos'),
  sexo: z.string().min(1, 'Sexo é obrigatório'),
  estado_civil: z.string().min(1, 'Estado civil é obrigatório'),
  endereco: z.string().min(1, 'Endereço é obrigatório'),
  telefone: z.string().regex(/^\d{10,11}$/, 'Telefone deve ter 10 ou 11 dígitos'),
  responsavel_legal: z.string().optional(),
  telefone_responsavel: z.string().optional(),
  convenio: z.string().optional(),
  numero_carteirinha: z.string().optional()
});

export class RegisterController {
  async registerAccess(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { email, senha, tipo_usuario } = registerAccessSchema.parse(request.body);
      const user = await registerService.createUser(email, senha, tipo_usuario);
      reply.send({ message: 'Dados de acesso registrados com sucesso', userId: user.id });
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

  async registerPersonal(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = registerPersonalSchema.parse(request.body);
      const paciente = await registerService.createPaciente(data);
      
      // Buscar dados do usuário para gerar JWT
      const usuario = await registerService.getUsuarioById(data.usuario_id);
      
      // Gerar JWT
      const token = jwt.sign(
        { id: usuario.id, email: usuario.email, tipo_usuario: usuario.tipo_usuario },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );
      
      reply.send({ 
        message: 'Dados pessoais registrados com sucesso. Cadastro completo!', 
        pacienteId: paciente.id,
        user: {
          id: usuario.id,
          email: usuario.email,
          tipo_usuario: usuario.tipo_usuario,
          token
        }
      });
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