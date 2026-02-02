import Fastify from 'fastify'
import prisma from './config/database'
import dotenv from 'dotenv'
import { appRoutes } from './routes/index'
import { initSignalServer } from './server-signal'
import logger from './utils/logger'
import { errorHandler } from './middlewares/errorHandler'

dotenv.config()

// Garantir que o servidor utilize o fuso horário local de Brasília para sincronização
process.env.TZ = 'America/Sao_Paulo';

const server = Fastify({ logger: false }) // Desativar logger padrão do Fastify

// Registrar middleware de erro
server.setErrorHandler(errorHandler)

const start = async () => {
  try {
    // Registrar todas as rotas centralizadas
    await server.register(appRoutes)

    // Inicializar servidor HTTP
    await server.listen({
      port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
      host: '0.0.0.0'
    })

    // Inicializar WebSocket de sinalização
    const httpServer = server.server
    initSignalServer(httpServer)

    // Conectar ao banco de dados
    await prisma.$connect()

    logger.info('Server started successfully', {
      port: process.env.PORT || 3000,
      host: '0.0.0.0'
    })
    logger.info('Database connected')
  } catch (err) {
    logger.error('Failed to start server', err as Error)
    process.exit(1)
  }
}

start()
