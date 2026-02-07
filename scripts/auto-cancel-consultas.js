/**
 * Script de Cancelamento Automático de Consultas
 * 
 * Este script cancela automaticamente:
 * 1. Consultas agendadas que passaram mais de 2 horas do horário marcado
 * 2. Consultas solicitadas que não foram aceitas até o dia do agendamento
 * 
 * Execução: node scripts/auto-cancel-consultas.js
 * Cron: 0 * * * * (a cada hora)
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// Configurações (podem ser sobrescritas por variáveis de ambiente)
const HOURS_BEFORE_CANCEL_AGENDADA = parseInt(process.env.HOURS_BEFORE_AUTO_CANCEL_AGENDADA || '2')
const ENABLE_LOGS = process.env.ENABLE_CANCEL_LOGS !== 'false'

function log(message, data = {}) {
    if (ENABLE_LOGS) {
        const timestamp = new Date().toISOString()
        console.log(`[${timestamp}] ${message}`, Object.keys(data).length > 0 ? JSON.stringify(data, null, 2) : '')
    }
}

async function autoCancelExpiredConsultas() {
    const startTime = Date.now()
    const now = new Date()

    log('📅 Iniciando auto-cancelamento de consultas...')

    try {
        // ========================================
        // 1. CANCELAR CONSULTAS AGENDADAS EXPIRADAS
        // ========================================

        const hoursAgo = new Date(now.getTime() - HOURS_BEFORE_CANCEL_AGENDADA * 60 * 60 * 1000)

        log(`🔍 Buscando consultas agendadas expiradas (anteriores a ${hoursAgo.toISOString()})...`)

        const expiredAgendadas = await prisma.consulta.findMany({
            where: {
                status: 'agendada',
                hora_inicio: {
                    lt: hoursAgo
                }
            },
            include: {
                medico: { select: { id: true, nome_completo: true } },
                paciente: { select: { id: true, nome_completo: true } }
            }
        })

        log(`✓ Encontradas ${expiredAgendadas.length} consultas agendadas expiradas`)

        let agendadasCancelledCount = 0

        for (const consulta of expiredAgendadas) {
            try {
                await prisma.consulta.update({
                    where: { id: consulta.id },
                    data: {
                        status: 'cancelled',
                        updatedAt: now
                    }
                })

                agendadasCancelledCount++

                log(`  ✓ Consulta #${consulta.id} cancelada (agendada expirada)`, {
                    consulta_id: consulta.id,
                    medico: consulta.medico?.nome_completo || 'Não atribuído',
                    paciente: consulta.paciente?.nome_completo,
                    hora_inicio: consulta.hora_inicio,
                    motivo: 'Passou mais de 2 horas do horário agendado'
                })

            } catch (error) {
                log(`  ❌ Erro ao cancelar consulta #${consulta.id}`, { error: error.message })
            }
        }

        // ========================================
        // 2. CANCELAR CONSULTAS SOLICITADAS NÃO ACEITAS
        // ========================================

        const today = now.toISOString().split('T')[0] // YYYY-MM-DD

        log(`🔍 Buscando consultas solicitadas não aceitas (data anterior a ${today})...`)

        const expiredSolicitadas = await prisma.consulta.findMany({
            where: {
                status: 'solicitada',
                data_consulta: {
                    lt: today
                }
            },
            include: {
                medico: { select: { id: true, nome_completo: true } },
                paciente: { select: { id: true, nome_completo: true } }
            }
        })

        log(`✓ Encontradas ${expiredSolicitadas.length} consultas solicitadas não aceitas`)

        let solicitadasCancelledCount = 0

        for (const consulta of expiredSolicitadas) {
            try {
                await prisma.consulta.update({
                    where: { id: consulta.id },
                    data: {
                        status: 'cancelled',
                        updatedAt: now
                    }
                })

                solicitadasCancelledCount++

                log(`  ✓ Consulta #${consulta.id} cancelada (solicitada não aceita)`, {
                    consulta_id: consulta.id,
                    medico: consulta.medico?.nome_completo || 'Não atribuído',
                    paciente: consulta.paciente?.nome_completo,
                    data_consulta: consulta.data_consulta,
                    motivo: 'Não foi aceita até o dia do agendamento'
                })

            } catch (error) {
                log(`  ❌ Erro ao cancelar consulta #${consulta.id}`, { error: error.message })
            }
        }

        // ========================================
        // 3. RESUMO E ESTATÍSTICAS
        // ========================================

        const totalCancelled = agendadasCancelledCount + solicitadasCancelledCount
        const duration = ((Date.now() - startTime) / 1000).toFixed(2)

        log('\n' + '='.repeat(60))
        log('📊 RESUMO DO AUTO-CANCELAMENTO')
        log('='.repeat(60))
        log(`Total de consultas canceladas: ${totalCancelled}`)
        log(`  - Agendadas expiradas: ${agendadasCancelledCount}`)
        log(`  - Solicitadas não aceitas: ${solicitadasCancelledCount}`)
        log(`Tempo de execução: ${duration}s`)
        log('='.repeat(60) + '\n')

        // Retornar para scripts que podem importar esta função
        return {
            success: true,
            totalCancelled,
            agendadasCancelled: agendadasCancelledCount,
            solicitadasCancelled: solicitadasCancelledCount,
            duration: parseFloat(duration)
        }

    } catch (error) {
        log('❌ Erro crítico no auto-cancelamento', {
            error: error.message,
            stack: error.stack
        })
        throw error
    }
}

// Executar se chamado diretamente (não importado)
if (require.main === module) {
    autoCancelExpiredConsultas()
        .then((result) => {
            log('✅ Auto-cancelamento concluído com sucesso')
            process.exit(0)
        })
        .catch((error) => {
            log('💥 Auto-cancelamento falhou', { error: error.message })
            process.exit(1)
        })
        .finally(() => {
            prisma.$disconnect()
        })
}

// Exportar para poder ser usado em testes ou importado
module.exports = { autoCancelExpiredConsultas }
