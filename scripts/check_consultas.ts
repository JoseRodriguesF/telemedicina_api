import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const statuses = await prisma.consulta.groupBy({
        by: ['status'],
        _count: {
            id: true
        }
    })
    console.log('--- Contagem de consultas por status ---')
    console.log(JSON.stringify(statuses, null, 2))
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
