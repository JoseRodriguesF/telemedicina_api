import { FastifyInstance } from 'fastify';
import { RegisterController } from '../controllers/registerController';

const registerController = new RegisterController();

export async function registerRoutes(app: FastifyInstance) {
  app.post('/register/acesso', registerController.registerAccess.bind(registerController));
  app.post('/register/pessoais', registerController.registerPersonal.bind(registerController));
  app.post('/register/medicos', registerController.registerMedico.bind(registerController));
}