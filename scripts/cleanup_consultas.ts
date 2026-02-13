import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('--- Iniciando limpeza de consultas em andamento ---')

    // Contar quantas consultas em andamento existem
    const count = await prisma.consulta.count({
        where: {
            status: 'in_progress'
        }
    })

    console.log(`Encontradas ${count} consultas com status 'in_progress'.`)

    if (count > 0) {
        // Deletar as consultas
        // Nota: HistoriaClinica com consulta_id terá que ser tratada se não houver cascade
        // Como no schema não tem cascade explícito para HistoriaClinica, 
        // vamos primeiro setar consulta_id como null nas histórias clínicas associadas

        await prisma.historiaClinica.updateMany({
            where: {
                consulta: {
                    status: 'in_progress'
                }
            },
            data: {
                consultaId: null
            }
        })

        const deleted = await prisma.consulta.deleteMany({
            where: {
                status: 'in_progress'
            }
        })

        console.log(`✅ Sucesso! Foram removidas ${deleted.count} consultas.`)
    } else {
        console.log('Nenhuma consulta em andamento para remover.')
    }
}

main()
    .catch((e) => {
        console.error('❌ Erro ao remover consultas:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
