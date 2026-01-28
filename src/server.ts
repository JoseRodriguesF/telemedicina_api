import Fastify from 'fastify'
import prisma from './config/database'
import dotenv from 'dotenv'
import { registerRoutes } from './routes/register'
import { loginRoutes } from './routes/login'
import { googleRoutes } from './routes/google'
import consultasRoutes from './routes/consultas'
import prontoSocorroRoutes from './routes/prontoSocorro'
import { initSignalServer } from './server-signal'
import { openaiRoutes } from './routes/openai'
import { historiaClinicaRoutes } from './routes/historiaClinica'
import { perfilRoutes } from './routes/perfil'
import logger from './utils/logger'
import { errorHandler } from './middlewares/errorHandler'

dotenv.config()

const server = Fastify({ logger: false }) // Desativar logger padrão do Fastify

// Registrar middleware de erro
server.setErrorHandler(errorHandler)

const start = async () => {
  try {
    // Registrar todas as rotas
    await Promise.all([
      registerRoutes(server),
      loginRoutes(server),
      googleRoutes(server),
      consultasRoutes(server),
      prontoSocorroRoutes(server),
      openaiRoutes(server),
      historiaClinicaRoutes(server),
      perfilRoutes(server)
    ])

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
