import { FastifyInstance } from 'fastify'
import { PerfilController } from '../controllers/perfilController'
import { authenticateJWT } from '../middlewares/auth'

const perfilController = new PerfilController()

export async function perfilRoutes(app: FastifyInstance) {
    // Aplicar authentication apenas nestas rotas
    app.get('/usuarios/me', { preHandler: authenticateJWT }, perfilController.getMe.bind(perfilController))
    app.patch('/usuarios/me', { preHandler: authenticateJWT }, perfilController.updateMe.bind(perfilController))
}
