import { FastifyInstance } from 'fastify';
import { GoogleController } from '../controllers/googleController';

const googleController = new GoogleController();

export async function googleRoutes(app: FastifyInstance) {
  app.post('/auth/google', googleController.auth.bind(googleController));
  app.post('/register/google', googleController.register.bind(googleController));
}
