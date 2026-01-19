import { PrismaClient } from '@prisma/client'

// Configuração segura do Prisma Client
const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    errorFormat: 'minimal',
})

// Graceful shutdown
process.on('beforeExit', async () => {
    await prisma.$disconnect()
})

export default prisma