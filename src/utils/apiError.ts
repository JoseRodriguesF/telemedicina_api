export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: any;
  payload?: any;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: any, payload?: any) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.payload = payload;
  }
}

export default ApiError;
