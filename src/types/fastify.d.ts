import 'fastify'
import { AuthenticatedUser } from './shared'

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser
  }
}