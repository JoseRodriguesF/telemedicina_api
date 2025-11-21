import { FastifyRequest, FastifyReply } from 'fastify';
import { RegisterService } from '../services/registerService';
import { z } from 'zod';

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
        reply.code(400).send({ error: 'Dados inválidos', details: error.issues });
      } else {
        const statusCode = error.statusCode || 500;
        reply.code(statusCode).send({ error: error.message });
      }
    }
  }

  async registerPersonal(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = registerPersonalSchema.parse(request.body);
      const paciente = await registerService.createPaciente(data);
      reply.send({ message: 'Dados pessoais registrados com sucesso', pacienteId: paciente.id });
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