import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

/**
 * CUSTÓDIA DE CHAVES (KMS):
 * Em conformidade com LGPD/CFM, a chave DEVE ser carregada de uma variável de ambiente segura.
 * O uso de chaves hardcoded é proibido para evitar exposição em caso de vazamento do código.
 */
const getEncryptionKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error('CRITICAL_SECURITY_FAILURE: ENCRYPTION_KEY not found in environment.')
  }
  // A chave deve ser de 32 bytes (256 bits) em formato HEX
  return Buffer.from(key, 'hex')
}

/**
 * Criptografa dados (string ou buffer) usando AES-256-GCM.
 * LGPD: Proteção de dados sensíveis (SND) em repouso.
 */
export function encrypt(data: string | Buffer): string {
  if (!data) return typeof data === 'string' ? data : ''
  
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8')
  
  let encrypted = cipher.update(buffer)
  encrypted = Buffer.concat([encrypted, cipher.final()])
  
  const authTag = cipher.getAuthTag()
  
  // Retorna iv:authTag:encrypted (tudo em hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Descriptografa dados para string ou buffer.
 */
export function decrypt(encryptedData: string, returnBuffer = false): string | Buffer {
  if (!encryptedData || !encryptedData.includes(':')) return encryptedData
  
  try {
    const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':')
    if (!ivHex || !authTagHex || !encryptedHex) return encryptedData

    const key = getEncryptionKey()
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const encrypted = Buffer.from(encryptedHex, 'hex')
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    
    let decrypted = decipher.update(encrypted)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    
    return returnBuffer ? decrypted : decrypted.toString('utf8')
  } catch (error) {
    console.error('CRITICAL_DECRYPTION_FAILURE:', error)
    // Em auditoria, nunca retornar o dado original se falhar; lançar erro ou retornar vazio.
    throw new Error('Falha na segurança: não foi possível descriptografar os dados.')
  }
}
