import prisma from '../config/database'
import bcrypt from 'bcrypt'
import ApiError from '../utils/apiError'
import { generateJWT } from '../utils/security'
import logger from '../utils/logger'

export class LoginService {
  async authenticateUser(email: string, senha: string) {
    // Buscar usuário por email com dados necessários em uma única query
    const user = await prisma.usuario.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        senha_hash: true,
        tipo_usuario: true,
        registroFull: true,
        medico: {
          select: {
            nome_completo: true,
            verificacao: true
          }
        },
        paciente: {
          select: {
            nome_completo: true
          }
        }
      }
    })

    if (!user) {
      logger.warn('Login attempt with non-existent email', { email: logger.sanitize({ email }) })
      throw new ApiError('Usuário com este email não foi encontrado.', 404, 'USER_NOT_FOUND')
    }

    // Verificar senha
    if (!user.senha_hash) {
      logger.info('OAuth user attempted password login', { userId: user.id })
      throw new ApiError('Esta conta está vinculada ao Google. Faça login usando o Google.', 401, 'USE_GOOGLE_AUTH')
    }

    const isPasswordValid = await bcrypt.compare(senha, user.senha_hash)
    if (!isPasswordValid) {
      logger.warn('Failed login attempt - wrong password', { userId: user.id })
      throw new ApiError('Senha incorreta. Verifique sua senha e tente novamente.', 401, 'WRONG_PASSWORD')
    }

    // Extrair nome e verificação do perfil correspondente
    let nome: string | undefined
    let verificacao: string | undefined

    if (user.tipo_usuario === 'medico' && user.medico) {
      nome = user.medico.nome_completo
      verificacao = user.medico.verificacao
    } else if (user.tipo_usuario === 'paciente' && user.paciente) {
      nome = user.paciente.nome_completo
    }

    // Gerar JWT usando helper seguro
    const token = generateJWT({
      id: user.id,
      email: user.email,
      tipo_usuario: user.tipo_usuario
    })

    logger.info('Successful login', { userId: user.id, tipo_usuario: user.tipo_usuario })

    return {
      id: user.id,
      email: user.email,
      tipo_usuario: user.tipo_usuario,
      registro_full: user.registroFull,
      nome,
      verificacao,
      token
    }
  }
}