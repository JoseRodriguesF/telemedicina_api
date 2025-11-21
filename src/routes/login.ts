import { FastifyInstance } from 'fastify';
import { LoginController } from '../controllers/loginController';

const loginController = new LoginController();

export async function loginRoutes(app: FastifyInstance) {
  app.post('/login', loginController.login.bind(loginController));
}