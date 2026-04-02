/**
 * Utilitário para sanitização de strings contra XSS e outros inputs maliciosos.
 * OWASP Top 10: Prevenir Injection/XSS.
 */
export function sanitize(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null
  
  // Remove tags HTML para evitar XSS
  // Em uma aplicação real, poderíamos usar bibliotecas como 'dompurify' ou 'sanitize-html'
  // Para este protótipo, usaremos regex simples p/ remover tags <script> e outras
  return String(text)
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, '')
    .replace(/<[^>]*>?/gm, '') // Remove qualquer tag HTML
    .trim()
}
