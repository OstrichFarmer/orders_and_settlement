export class AppError extends Error {
  code: string;
  status: number;
  extra?: Record<string, unknown>;

  constructor(code: string, message: string, status: number, extra?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, extra?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, extra);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string, extra?: Record<string, unknown>) {
    super(code, message, 409, extra);
  }
}

export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return Response.json({ error: { code: err.code, message: err.message, ...err.extra } }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, { status: 500 });
}
