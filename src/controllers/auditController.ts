import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../config/database';
import { AuthenticatedUser } from '../types/shared';

/**
 * Registra um evento técnico (monitoramento WebRTC, quedas, qualidade)
 * Exigência CFM Resolução 2.314/2022 Art. 10
 */
export async function logEventoTecnico(
    req: FastifyRequest<{ Body: { consultaId: number; tipo: string; status_info?: any; observacao?: string } }>,
    reply: FastifyReply
) {
    try {
        const user = req.user as AuthenticatedUser;
        const { consultaId, tipo, status_info, observacao } = req.body;

        if (!consultaId || !tipo) {
            return reply.code(400).send({ error: 'consultaId e tipo são obrigatórios' });
        }

        const evento = await prisma.eventoTecnico.create({
            data: {
                consultaId: Number(consultaId),
                usuarioId: user.id,
                tipo,
                status_info: status_info || {},
                observacao: observacao || null
            }
        });

        // Se for uma falha de conexão, registra também no registro principal da consulta
        if (tipo === 'FAIL_CONNECTION' || tipo === 'ABNORMAL_DISCONNECT') {
            const timestamp = new Date().toLocaleTimeString('pt-BR');
            const userType = user.tipo_usuario;
            const newObservation = `[${timestamp}] Falha detectada (${userType}): ${observacao || 'Queda de conexão WebRTC'}`;

            await prisma.consulta.update({
                where: { id: Number(consultaId) },
                data: {
                    observacaoTecnica: {
                        set: await prisma.consulta.findUnique({
                            where: { id: Number(consultaId) },
                            select: { observacaoTecnica: true }
                        }).then(c => c?.observacaoTecnica ? `${c.observacaoTecnica}\n${newObservation}` : newObservation)
                    }
                }
            });
        }

        return reply.code(201).send(evento);
    } catch (error) {
        console.error('Erro ao registrar evento técnico:', error);
        return reply.code(500).send({ error: 'Erro ao registrar auditoria técnica' });
    }
}
