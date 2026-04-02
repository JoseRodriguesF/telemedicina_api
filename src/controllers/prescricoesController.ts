import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../config/database';
import { AuthenticatedUser } from '../types/shared';
import { logAuditoria } from '../utils/auditLogger';
import { encrypt, decrypt } from '../utils/encryption';
import logger from '../utils/logger';

/**
 * Validação de Magic Bytes para PDF
 * OWASP: Prevenção de Content-Type Sniffing e upload de arquivos maliciosos.
 */
function isStrictPdf(buffer: Buffer): boolean {
    return buffer.slice(0, 4).toString() === '%PDF';
}

/**
 * Criar uma nova prescrição
 */
export async function createPrescricao(
    req: FastifyRequest<{ Body: { consultaId: number; medicamento: string; marca?: string; dosagem: string; frequencia: string; duracao: string; inclusoConvenio?: boolean; pdf?: { data: string; mimetype: string } } }>,
    reply: FastifyReply
) {
    try {
        const user = req.user as AuthenticatedUser;
        const { consultaId, medicamento, marca, dosagem, frequencia, duracao, inclusoConvenio, pdf } = req.body;

        if (!consultaId || !medicamento || !dosagem || !frequencia || !duracao) {
            return reply.code(400).send({ error: 'Campos obrigatórios ausentes' });
        }

        const consulta = await prisma.consulta.findUnique({ where: { id: Number(consultaId) } });
        if (!consulta) return reply.code(404).send({ error: 'Consulta não encontrada' });

        if (user.tipo_usuario !== 'medico' || (consulta.medicoId !== user.medicoId)) {
            return reply.code(403).send({ error: 'Acesso negado. Apenas o médico responsável pode prescrever.' });
        }

        let encryptedPdfData = null;
        if (pdf) {
            const pdfBuffer = Buffer.from(pdf.data, 'base64');
            // SECURITY: Validação de Magic Bytes
            if (!isStrictPdf(pdfBuffer)) {
                return reply.code(400).send({ error: 'Arquivo inválido. Apenas PDFs reais são permitidos.' });
            }
            // LGPD: Criptografia do PDF antes de salvar no banco
            encryptedPdfData = Buffer.from(encrypt(pdfBuffer), 'utf8');
        }

        const prescricao = await prisma.prescricao.create({
            data: {
                consultaId: Number(consultaId),
                medicamento,
                marca: marca || null,
                dosagem,
                frequencia,
                duracao,
                inclusoConvenio: inclusoConvenio || false,
                pdf_data: encryptedPdfData,
                pdf_mimetype: pdf ? pdf.mimetype : null,
            }
        });

        await logAuditoria({
            usuarioId: user.id,
            acao: 'EMISSAO_PRESCRICAO',
            recurso: 'prescricao',
            recursoId: prescricao.id,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        return reply.code(201).send({ ok: true, id: prescricao.id });
    } catch (error) {
        logger.error('Erro ao criar prescrição', error);
        return reply.code(500).send({ error: 'Erro interno ao criar prescrição' });
    }
}

/**
 * Listar prescrições de uma consulta (Seguro contra IDOR)
 */
export async function getPrescricoesByConsulta(
    req: FastifyRequest<{ Params: { consultaId: string } }>,
    reply: FastifyReply
) {
    try {
        const user = req.user as AuthenticatedUser;
        const { consultaId } = req.params;

        const consulta = await prisma.consulta.findUnique({ where: { id: Number(consultaId) } });
        if (!consulta) return reply.code(404).send({ error: 'Consulta não encontrada' });

        const isAuthorized =
            (user.tipo_usuario === 'medico' && consulta.medicoId === user.medicoId) ||
            (user.tipo_usuario === 'paciente' && consulta.pacienteId === user.pacienteId) ||
            (user.tipo_usuario === 'admin');

        if (!isAuthorized) return reply.code(403).send({ error: 'Acesso negado' });

        const prescricoes = await prisma.prescricao.findMany({
            where: { consultaId: Number(consultaId) },
            select: {
                id: true,
                medicamento: true,
                dosagem: true,
                frequencia: true,
                duracao: true,
                createdAt: true,
                pdf_mimetype: true,
            },
            orderBy: { createdAt: 'desc' }
        });

        return reply.send(prescricoes.map(p => ({ ...p, tem_pdf: !!p.pdf_mimetype })));
    } catch (error) {
        return reply.code(500).send({ error: 'Erro interno' });
    }
}

/**
 * Obter o PDF de uma prescrição (Descriptografia On-the-fly)
 */
export async function getPrescricaoPdf(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
) {
    try {
        const user = req.user as AuthenticatedUser;
        const { id } = req.params;

        const prescricao = await prisma.prescricao.findUnique({
            where: { id: Number(id) },
            include: { consulta: true }
        });

        if (!prescricao || !prescricao.pdf_data) {
            return reply.code(404).send({ error: 'PDF não encontrado' });
        }

        const isAuthorized =
            (user.tipo_usuario === 'medico' && prescricao.consulta.medicoId === user.medicoId) ||
            (user.tipo_usuario === 'paciente' && prescricao.consulta.pacienteId === user.pacienteId) ||
            (user.tipo_usuario === 'admin');

        if (!isAuthorized) return reply.code(403).send({ error: 'Acesso negado' });

        // LGPD: Descriptografia do documento para o usuário autorizado
        const encryptedString = Buffer.from(prescricao.pdf_data).toString('utf8');
        const decryptedBuffer = decrypt(encryptedString, true) as Buffer;

        await logAuditoria({
            usuarioId: user.id,
            acao: 'DOWNLOAD_PRESCRICAO_PDF',
            recurso: 'prescricao',
            recursoId: prescricao.id,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        return reply
            .type(prescricao.pdf_mimetype || 'application/pdf')
            .send(decryptedBuffer);
    } catch (error) {
        logger.error('Erro ao buscar PDF da prescrição', error);
        return reply.code(500).send({ error: 'Falha na segurança ao processar documento.' });
    }
}

// Os demais métodos (update, delete, sugestoes) devem seguir o mesmo padrão de checkAuth...
// ... (restantes métodos omitidos para brevidade mas devem ser mantidos com as correções de checkAuth)

/**
 * Atualizar uma prescrição
 */
export async function updatePrescricao(
    req: FastifyRequest<{ Params: { id: string }; Body: Partial<{ medicamento: string; marca: string; dosagem: string; frequencia: string; duracao: string; inclusoConvenio: boolean; pdf: { data: string; mimetype: string } }> }>,
    reply: FastifyReply
) {
    try {
        const user = req.user as AuthenticatedUser;
        const { id } = req.params;
        const { medicamento, marca, dosagem, frequencia, duracao, inclusoConvenio, pdf } = req.body;

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
                ...(inclusoConvenio !== undefined && { inclusoConvenio }),
                ...(pdf && {
                    pdf_data: Buffer.from(pdf.data, 'base64'),
                    pdf_mimetype: pdf.mimetype
                })
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

        // PRIVACIDADE/LGPD: Um médico só pode ver o histórico se já atendeu ou está atendendo o paciente.
        let isAuthorized = false;
        
        if (user.tipo_usuario === 'admin') {
            isAuthorized = true;
        } else if (user.tipo_usuario === 'paciente' && user.pacienteId === Number(pacienteId)) {
            isAuthorized = true;
        } else if (user.tipo_usuario === 'medico') {
            // Verifica se existe pelo menos uma consulta entre este médico e o paciente
            const vinculo = await prisma.consulta.findFirst({
                where: {
                    pacienteId: Number(pacienteId),
                    medicoId: user.medicoId
                }
            });
            if (vinculo) isAuthorized = true;
        }

        if (!isAuthorized) {
            return reply.code(403).send({ error: 'Acesso negado. Sem vínculo clínico com o paciente.' });
        }

        const prescricoes = await prisma.prescricao.findMany({
            where: {
                consulta: {
                    pacienteId: Number(pacienteId)
                }
            },
            select: {
                id: true,
                consultaId: true,
                medicamento: true,
                marca: true,
                dosagem: true,
                frequencia: true,
                duracao: true,
                inclusoConvenio: true,
                createdAt: true,
                updatedAt: true,
                pdf_mimetype: true,
                assinaturaHash: true, // Campo essencial para conferência ICP-Brasil
                consulta: {
                    select: {
                        data_consulta: true,
                        createdAt: true,
                        status: true,
                        medico: {
                            select: {
                                nome_completo: true,
                                crm: true,     // CFM: Dados obrigatórios do médico
                                crm_uf: true   // CFM: Dados obrigatórios do médico
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Auditoria: Acesso ao histórico de prescrições
        await logAuditoria({
            usuarioId: user.id,
            acao: 'LISTAGEM_HISTORICO_PRESCRICOES',
            recurso: 'paciente',
            recursoId: Number(pacienteId),
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Adiciona flag para o front
        const result = prescricoes.map(p => ({
            ...p,
            tem_pdf: !!p.pdf_mimetype
        }));

        return reply.code(200).send(result);
    } catch (error) {
        console.error('Erro ao buscar histórico de prescrições:', error);
        return reply.code(500).send({ error: 'Erro ao buscar histórico de prescrições' });
    }
}

