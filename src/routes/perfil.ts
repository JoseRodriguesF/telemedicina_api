import { FastifyInstance } from 'fastify'
import { PerfilController } from '../controllers/perfilController'
import { authenticateJWT } from '../middlewares/auth'

const perfilController = new PerfilController()

export async function perfilRoutes(app: FastifyInstance) {
    // Todas as rotas de perfil requerem autenticação
    app.addHook('onRequest', authenticateJWT)

    app.get('/usuarios/me', perfilController.getMe.bind(perfilController))
    app.patch('/usuarios/me', perfilController.updateMe.bind(perfilController))
}
