import prisma from '../config/database';

export interface AuditLogOptions {
    usuarioId: number;
    acao: string;
    recurso: string;
    recursoId?: number;
    detalhes?: string;
    ip?: string;
    userAgent?: string;
}

/**
 * Registra uma ação na trilha de auditoria para conformidade CFM e LGPD.
 */
export async function logAuditoria(options: AuditLogOptions) {
    try {
        await prisma.trilhaAuditoria.create({
            data: {
                usuarioId: options.usuarioId,
                acao: options.acao,
                recurso: options.recurso,
                recursoId: options.recursoId,
                detalhes: options.detalhes,
                ip: options.ip,
                userAgent: options.userAgent
            }
        });
    } catch (error) {
        // Falha no log não deve travar a operação principal, mas deve ser registrada no console erro
        console.error('CRITICAL: Falha ao gravar trilha de auditoria:', error);
    }
}
