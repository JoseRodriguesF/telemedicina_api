import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

export const authenticateJWT = async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Token de acesso necessário' });
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer '

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: number; email: string; tipo_usuario: string };
    request.user = decoded; // Adiciona dados do usuário na request
  } catch (error) {
    reply.code(401).send({ error: 'Token inválido ou expirado' });
  }
};