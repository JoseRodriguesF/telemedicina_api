import { FastifyInstance } from 'fastify';
import { RegisterController } from '../controllers/registerController';
import { authenticateJWT } from '../middlewares/auth';

const registerController = new RegisterController();

export async function registerRoutes(app: FastifyInstance) {
  app.post('/register/acesso', registerController.registerAccess.bind(registerController));
  app.post('/register/pessoais', { preHandler: authenticateJWT }, registerController.registerPersonal.bind(registerController));
}