import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';

export const authenticateJWT = async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Token de acesso necessário' });
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer '

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: number; email: string; tipo_usuario: string };

    // Buscar usuário completo no banco para garantir que a conta existe
    const usuario = await prisma.usuario.findUnique({ where: { id: decoded.id } });
    if (!usuario) {
      reply.code(401).send({ error: 'Usuário não encontrado' });
      return;
    }

    // Anexa registro completo (evita suposições sobre campos como senha)
    request.user = usuario as any;
  } catch (error: any) {
    reply.code(401).send({ error: 'Token inválido ou expirado' });
  }
};