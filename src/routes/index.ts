import { FastifyInstance } from 'fastify'
import { registerRoutes } from './register'
import { loginRoutes } from './login'
import { googleRoutes } from './google'
import consultasRoutes from './consultas'
import prontoSocorroRoutes from './prontoSocorro'
import { openaiRoutes } from './openai'
import { historiaClinicaRoutes } from './historiaClinica'
import { perfilRoutes } from './perfil'

/**
 * Centralized route registration
 */
export async function appRoutes(fastify: FastifyInstance) {
    await fastify.register(registerRoutes)
    await fastify.register(loginRoutes)
    await fastify.register(googleRoutes)
    await fastify.register(consultasRoutes)
    await fastify.register(prontoSocorroRoutes)
    await fastify.register(openaiRoutes)
    await fastify.register(historiaClinicaRoutes)
    await fastify.register(perfilRoutes)
}
