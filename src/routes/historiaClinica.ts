import { FastifyInstance } from 'fastify'
import { HistoriaClinicaController } from '../controllers/historiaClinicaController'
import { authenticateJWT } from '../middlewares/auth'

const controller = new HistoriaClinicaController()

export async function historiaClinicaRoutes(fastify: FastifyInstance) {
    // Criar história clínica
    fastify.route({
        method: 'POST',
        url: '/historia-clinica',
        preHandler: authenticateJWT,
        handler: (req, reply) => controller.criar(req, reply)
    })

    // Buscar todas as histórias clínicas de um paciente
    fastify.route({
        method: 'GET',
        url: '/historia-clinica/paciente/:pacienteId',
        preHandler: authenticateJWT,
        handler: (req, reply) => controller.buscarPorPaciente(req, reply)
    })

    // Buscar última história clínica de um paciente
    fastify.route({
        method: 'GET',
        url: '/historia-clinica/paciente/:pacienteId/ultima',
        preHandler: authenticateJWT,
        handler: (req, reply) => controller.buscarUltima(req, reply)
    })

    // Buscar história clínica por ID
    fastify.route({
        method: 'GET',
        url: '/historia-clinica/:id',
        preHandler: authenticateJWT,
        handler: (req, reply) => controller.buscarPorId(req, reply)
    })
}
