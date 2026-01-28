import { FastifyInstance } from 'fastify'
import { PerfilController } from '../controllers/perfilController'

const perfilController = new PerfilController()

export async function perfilRoutes(app: FastifyInstance) {
    // Rotas protegidas (o middleware deve ser aplicado globalmente ou injetado aqui)
    app.get('/usuarios/me', perfilController.getMe.bind(perfilController))
    app.patch('/usuarios/me', perfilController.updateMe.bind(perfilController))
}
