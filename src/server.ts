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

dotenv.config()

const server = Fastify({ logger: true })

const start = async () => {
  try {
    // Registrar todas as rotas
    await Promise.all([
      registerRoutes(server),
      loginRoutes(server),
      googleRoutes(server),
      consultasRoutes(server),
      prontoSocorroRoutes(server),
      openaiRoutes(server)
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

    console.log('✅ Servidor rodando na porta', process.env.PORT || 3000)
    console.log('✅ Conectado ao banco de dados')
  } catch (err) {
    console.error('❌ Falha ao iniciar o servidor:')
    server.log.error(err)
    process.exit(1)
  }
}

start()
