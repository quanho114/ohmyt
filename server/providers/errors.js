export class ProviderOfflineError extends Error {
  constructor(msg = 'Endpoint unreachable', opts = {}) {
    super(msg);
    this.name = 'ProviderOfflineError';
    this.code = opts.code || 'UNREACHABLE';
    this.providerId = opts.providerId;
  }
}

export class AuthenticationError extends Error {
  constructor(msg = 'Authentication failed', opts = {}) {
    super(msg);
    this.name = 'AuthenticationError';
    this.code = 'AUTH';
    this.providerId = opts.providerId;
  }
}

export class ModelNotFoundError extends Error {
  constructor(model, opts = {}) {
    super(`Model not found: ${model}`);
    this.name = 'ModelNotFoundError';
    this.code = 'MODEL_NOT_FOUND';
    this.providerId = opts.providerId;
  }
}

export class CapabilityError extends Error {
  constructor(cap, opts = {}) {
    super(`Model does not support ${cap}`);
    this.name = 'CapabilityError';
    this.code = 'CAPABILITY';
    this.capability = cap;
    this.providerId = opts.providerId;
  }
}

export function mapHttpToError(status, body, opts = {}) {
  if (status === 401 || status === 403) return new AuthenticationError(`Authentication failed (HTTP ${status})`, opts);
  if (status === 404) return new ModelNotFoundError(opts.model || 'unknown', opts);
  return new Error(`LLM API HTTP ${status}: ${String(body || '').slice(0, 500)}`);
}
