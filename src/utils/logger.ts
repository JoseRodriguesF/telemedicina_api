/**
 * Logger estruturado para substituir console.log/console.error
 * Em produção, não expomos stack traces ou informações sensíveis
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogContext {
    [key: string]: any
}

class Logger {
    private isDevelopment = process.env.NODE_ENV === 'development'

    private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
        const timestamp = new Date().toISOString()
        const contextStr = context ? ` ${JSON.stringify(context)}` : ''
        return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`
    }

    info(message: string, context?: LogContext) {
        console.log(this.formatMessage('info', message, context))
    }

    warn(message: string, context?: LogContext) {
        console.warn(this.formatMessage('warn', message, context))
    }

    error(message: string, error?: Error | unknown, context?: LogContext) {
        const errorContext = { ...context }

        if (error instanceof Error) {
            errorContext.error = error.message
            if (this.isDevelopment) {
                errorContext.stack = error.stack
            }
        } else if (error) {
            errorContext.error = String(error)
        }

        console.error(this.formatMessage('error', message, errorContext))
    }

    debug(message: string, context?: LogContext) {
        if (this.isDevelopment) {
            console.debug(this.formatMessage('debug', message, context))
        }
    }

    /**
     * Sanitiza dados sensíveis antes de logar
     */
    sanitize(data: any): any {
        if (typeof data !== 'object' || data === null) return data

        const sanitized = { ...data }
        const sensitiveFields = ['senha', 'password', 'senha_hash', 'token', 'cpf', 'email']

        for (const field of sensitiveFields) {
            if (field in sanitized) {
                sanitized[field] = '***REDACTED***'
            }
        }

        return sanitized
    }
}

export const logger = new Logger()
export default logger
