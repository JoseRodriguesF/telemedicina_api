import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../config/database';
import { AuthenticatedUser } from '../types/shared';

/**
 * Criar uma nova prescrição
 */
export async function createPrescricao(
    req: FastifyRequest<{ Body: { consultaId: number; medicamento: string; marca?: string; dosagem: string; frequencia: string; duracao: string; inclusoConvenio?: boolean } }>,
    reply: FastifyReply
) {
    try {
        const user = req.user as AuthenticatedUser;
        const { consultaId, medicamento, marca, dosagem, frequencia, duracao, inclusoConvenio } = req.body;

        // Validações
        if (!consultaId || !medicamento || !dosagem || !frequencia || !duracao) {
            return reply.code(400).send({
                error: 'Campos obrigatórios: consultaId, medicamento, dosagem, frequencia, duracao'
            });
        }

        // Verifica se a consulta existe e se o médico tem permissão
        const consulta = await prisma.consulta.findUnique({
            where: { id: Number(consultaId) }
        });

        if (!consulta) {
            return reply.code(404).send({ error: 'Consulta não encontrada' });
        }

        // Apenas o médico responsável pode criar prescrições
        if (user.tipo_usuario !== 'medico' || (consulta.medicoId !== user.medicoId)) {
            return reply.code(403).send({ error: 'Acesso negado' });
        }

        // Cria a prescrição
        const prescricao = await prisma.prescricao.create({
            data: {
                consultaId: Number(consultaId),
                medicamento,
                marca: marca || null,
                dosagem,
                frequencia,
                duracao,
                inclusoConvenio: inclusoConvenio || false
            }
        });

        return reply.code(201).send(prescricao);
    } catch (error) {
        console.error('Erro ao criar prescrição:', error);
        return reply.code(500).send({ error: 'Erro ao criar prescrição' });
    }
}

/**
 * Listar prescrições de uma consulta
 */
export async function getPrescricoesByConsulta(
    req: FastifyRequest<{ Params: { consultaId: string } }>,
    reply: FastifyReply
) {
    try {
        const user = req.user as AuthenticatedUser;
        const { consultaId } = req.params;

        const consulta = await prisma.consulta.findUnique({
            where: { id: Number(consultaId) }
        });

        if (!consulta) {
            return reply.code(404).send({ error: 'Consulta não encontrada' });
        }

        // Verifica se o usuário tem permissão (médico ou paciente da consulta)
        const isAuthorized =
            (user.tipo_usuario === 'medico' && consulta.medicoId === user.medicoId) ||
            (user.tipo_usuario === 'paciente' && consulta.pacienteId === user.pacienteId);

        if (!isAuthorized) {
            return reply.code(403).send({ error: 'Acesso negado' });
        }

        const prescricoes = await prisma.prescricao.findMany({
            where: { consultaId: Number(consultaId) },
            orderBy: { createdAt: 'desc' }
        });

        return reply.code(200).send(prescricoes);
    } catch (error) {
        console.error('Erro ao buscar prescrições:', error);
        return reply.code(500).send({ error: 'Erro ao buscar prescrições' });
    }
}

/**
 * Atualizar uma prescrição
 */
export async function updatePrescricao(
    req: FastifyRequest<{ Params: { id: string }; Body: Partial<{ medicamento: string; marca: string; dosagem: string; frequencia: string; duracao: string; inclusoConvenio: boolean }> }>,
    reply: FastifyReply
) {
    try {
        const user = req.user as AuthenticatedUser;
        const { id } = req.params;
        const { medicamento, marca, dosagem, frequencia, duracao, inclusoConvenio } = req.body;

        // Busca a prescrição com a consulta
        const prescricaoExistente = await prisma.prescricao.findUnique({
            where: { id: Number(id) },
            include: { consulta: true }
        });

        if (!prescricaoExistente) {
            return reply.code(404).send({ error: 'Prescrição não encontrada' });
        }

        // Verifica se o médico tem permissão
        if (user.tipo_usuario !== 'medico' || prescricaoExistente.consulta.medicoId !== user.medicoId) {
            return reply.code(403).send({ error: 'Acesso negado' });
        }

        const prescricao = await prisma.prescricao.update({
            where: { id: Number(id) },
            data: {
                ...(medicamento && { medicamento }),
                ...(marca !== undefined && { marca }),
                ...(dosagem && { dosagem }),
                ...(frequencia && { frequencia }),
                ...(duracao && { duracao }),
                ...(inclusoConvenio !== undefined && { inclusoConvenio })
            }
        });

        return reply.code(200).send(prescricao);
    } catch (error) {
        console.error('Erro ao atualizar prescrição:', error);
        return reply.code(500).send({ error: 'Erro ao atualizar prescrição' });
    }
}

/**
 * Deletar uma prescrição
 */
export async function deletePrescricao(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
) {
    try {
        const user = req.user as AuthenticatedUser;
        const { id } = req.params;

        // Busca a prescrição com a consulta
        const prescricao = await prisma.prescricao.findUnique({
            where: { id: Number(id) },
            include: { consulta: true }
        });

        if (!prescricao) {
            return reply.code(404).send({ error: 'Prescrição não encontrada' });
        }

        // Verifica se o médico tem permissão
        if (user.tipo_usuario !== 'medico' || prescricao.consulta.medicoId !== user.medicoId) {
            return reply.code(403).send({ error: 'Acesso negado' });
        }

        await prisma.prescricao.delete({
            where: { id: Number(id) }
        });

        return reply.code(204).send();
    } catch (error) {
        console.error('Erro ao deletar prescrição:', error);
        return reply.code(500).send({ error: 'Erro ao deletar prescrição' });
    }
}

/**
 * Sugestões de medicamentos (fake por enquanto)
 */
export async function getSugestoesMedicamentos(
    req: FastifyRequest<{ Querystring: { query?: string } }>,
    reply: FastifyReply
) {
    try {
        const { query } = req.query;

        // Lista fake de medicamentos para sugestões
        const medicamentosFake = [
            'Paracetamol',
            'Ibuprofeno',
            'Amoxicilina',
            'Dipirona',
            'Omeprazol',
            'Losartana',
            'Metformina',
            'Atorvastatina',
            'Anlodipino',
            'Sinvastatina',
            'Captopril',
            'Azitromicina',
            'Cefalexina',
            'Clonazepam',
            'Diazepam',
            'Fluoxetina',
            'Sertralina',
            'Loratadina',
            'Dexametasona',
            'Prednisona'
        ];

        //Filtra por query se fornecida
        let sugestoes = medicamentosFake;
        if (query && typeof query === 'string') {
            const queryLower = query.toLowerCase();
            sugestoes = medicamentosFake.filter(med =>
                med.toLowerCase().includes(queryLower)
            );
        }

        return reply.code(200).send(sugestoes);
    } catch (error) {
        console.error('Erro ao buscar sugestões:', error);
        return reply.code(500).send({ error: 'Erro ao buscar sugestões' });
    }
}

/**
 * Sugestões de marcas (fake por enquanto)
 */
export async function getSugestoesMarcas(
    req: FastifyRequest<{ Querystring: { query?: string } }>,
    reply: FastifyReply
) {
    try {
        const { query } = req.query;

        // Lista fake de marcas para sugestões
        const marcasFake = [
            'Genérico',
            'EMS',
            'Medley',
            'Neo Química',
            'Eurofarma',
            'Aché',
            'Sandoz',
            'Novartis',
            'Pfizer',
            'Bayer',
            'Sanofi',
            'Roche',
            'Abbott',
            'Takeda',
            'Merck'
        ];

        // Filtra por query se fornecida
        let sugestoes = marcasFake;
        if (query && typeof query === 'string') {
            const queryLower = query.toLowerCase();
            sugestoes = marcasFake.filter(marca =>
                marca.toLowerCase().includes(queryLower)
            );
        }

        return reply.code(200).send(sugestoes);
    } catch (error) {
        console.error('Erro ao buscar sugestões de marcas:', error);
        return reply.code(500).send({ error: 'Erro ao buscar sugestões de marcas' });
    }
}

/**
 * Listar todas as prescrições de um paciente (histórico)
 */
export async function getPrescricoesByPaciente(
    req: FastifyRequest<{ Params: { pacienteId: string } }>,
    reply: FastifyReply
) {
    try {
        const user = req.user as AuthenticatedUser;
        const { pacienteId } = req.params;

        // Verifica se o usuário tem permissão (médico ou o próprio paciente)
        const isAuthorized =
            user.tipo_usuario === 'medico' ||
            (user.tipo_usuario === 'paciente' && user.pacienteId === Number(pacienteId));

        if (!isAuthorized) {
            return reply.code(403).send({ error: 'Acesso negado' });
        }

        const prescricoes = await prisma.prescricao.findMany({
            where: {
                consulta: {
                    pacienteId: Number(pacienteId)
                }
            },
            include: {
                consulta: {
                    select: {
                        data_consulta: true,
                        createdAt: true,
                        medico: {
                            select: {
                                nome_completo: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return reply.code(200).send(prescricoes);
    } catch (error) {
        console.error('Erro ao buscar histórico de prescrições:', error);
        return reply.code(500).send({ error: 'Erro ao buscar histórico de prescrições' });
    }
}
