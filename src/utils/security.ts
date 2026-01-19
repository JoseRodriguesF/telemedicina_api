import jwt from 'jsonwebtoken'

/**
 * Garante que JWT_SECRET está configurado
 */
function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET
    if (!secret) {
        throw new Error('JWT_SECRET não está configurado nas variáveis de ambiente')
    }
    return secret
}

/**
 * Gera um JWT para o usuário
 */
export function generateJWT(payload: { id: number; email: string; tipo_usuario: string }): string {
    return jwt.sign(
        payload,
        getJwtSecret(),
        { expiresIn: '7d', algorithm: 'HS256' }
    )
}

/**
 * Verifica e decodifica um JWT
 */
export function verifyJWT(token: string) {
    return jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] })
}

/**
 * Valida se um CPF é válido (validação completa com dígitos verificadores)
 */
export function validateCPF(cpf: string): boolean {
    // Remove tudo que não for dígito
    const cleanCPF = cpf.replace(/\D/g, '')

    // Verifica se tem 11 dígitos
    if (cleanCPF.length !== 11) return false

    // Verifica se todos os dígitos são iguais (CPF inválido)
    if (/^(\d)\1{10}$/.test(cleanCPF)) return false

    // Validação do primeiro dígito verificador
    let sum = 0
    for (let i = 0; i < 9; i++) {
        sum += parseInt(cleanCPF.charAt(i)) * (10 - i)
    }
    let digit = 11 - (sum % 11)
    if (digit >= 10) digit = 0
    if (digit !== parseInt(cleanCPF.charAt(9))) return false

    // Validação do segundo dígito verificador
    sum = 0
    for (let i = 0; i < 10; i++) {
        sum += parseInt(cleanCPF.charAt(i)) * (11 - i)
    }
    digit = 11 - (sum % 11)
    if (digit >= 10) digit = 0
    if (digit !== parseInt(cleanCPF.charAt(10))) return false

    return true
}

/**
 * Sanitiza CPF para armazenamento (apenas números)
 */
export function sanitizeCPF(cpf: string): string {
    return cpf.replace(/\D/g, '')
}

/**
 * Sanitiza telefone para armazenamento (apenas números)
 */
export function sanitizePhone(phone: string): string {
    return phone.replace(/\D/g, '')
}

/**
 * Valida formato de email (adicional ao Zod)
 */
export function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email) && email.length <= 255
}

/**
 * Sanitiza entrada de texto para prevenir XSS
 * Remove scripts e tags perigosas
 */
export function sanitizeText(text: string): string {
    return text
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .trim()
}

/**
 * Valida se uma data é válida e não é muito antiga/futura
 */
export function validateBirthDate(dateString: string): { valid: boolean; error?: string } {
    const date = new Date(dateString)

    if (isNaN(date.getTime())) {
        return { valid: false, error: 'Data inválida' }
    }

    const now = new Date()
    const minDate = new Date(now.getFullYear() - 120, 0, 1) // 120 anos atrás
    const maxDate = now // Hoje

    if (date < minDate) {
        return { valid: false, error: 'Data de nascimento muito antiga' }
    }

    if (date > maxDate) {
        return { valid: false, error: 'Data de nascimento não pode ser no futuro' }
    }

    return { valid: true }
}
