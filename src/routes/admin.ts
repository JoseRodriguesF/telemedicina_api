import { FastifyInstance } from 'fastify'
import { AdminController } from '../controllers/adminController'
import { authenticateJWT } from '../middlewares/auth'
import { requireAdmin } from '../middlewares/authorization'

const adminController = new AdminController()

export async function adminRoutes(fastify: FastifyInstance) {
    // Todas as rotas de admin exigem autenticação e papel de admin
    fastify.addHook('preHandler', authenticateJWT)
    fastify.addHook('preHandler', requireAdmin)

    fastify.get('/admin/stats', adminController.getStats.bind(adminController))
    fastify.get('/admin/medicos/pendentes', adminController.getPendingMedicos.bind(adminController))
    fastify.patch('/admin/medicos/:id/verificar', adminController.verifyMedico.bind(adminController))
    fastify.get('/admin/medicos/:id/documentos/:type', adminController.getMedicoDocument.bind(adminController))
}
