// ── Error types and handlers ──

export class ConduitError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = "CONDUIT_ERROR",
  ) {
    super(message);
    this.name = "ConduitError";
  }
}

export class NotFoundError extends ConduitError {
  constructor(resource: string, id: string) {
    super(404, `${resource} not found: ${id}`, "NOT_FOUND");
  }
}

export class ConflictError extends ConduitError {
  constructor(message: string) {
    super(409, message, "CONFLICT");
  }
}

export class ValidationError extends ConduitError {
  constructor(message: string) {
    super(400, message, "VALIDATION_ERROR");
  }
}

export class UnauthorizedError extends ConduitError {
  constructor(message: string = "Unauthorized") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends ConduitError {
  constructor(message: string = "Forbidden") {
    super(403, message, "FORBIDDEN");
  }
}

export function errorResponse(err: unknown) {
  if (err instanceof ConduitError) {
    return { status: err.statusCode, body: { error: err.code, message: err.message } };
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  return { status: 500, body: { error: "INTERNAL_ERROR", message } };
}
