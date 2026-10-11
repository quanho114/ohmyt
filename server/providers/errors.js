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

export class ProviderProtocolError extends Error {
  constructor(message = 'Provider response did not satisfy the required protocol') {
    super(message);
    this.name = 'ProviderProtocolError';
    this.code = 'PROTOCOL';
  }
}

export function mapHttpToError(status, body, opts = {}) {
  if (status === 401 || status === 403) return new AuthenticationError(`Authentication failed (HTTP ${status})`, opts);
  if (status === 404) return new ModelNotFoundError(opts.model || 'unknown', opts);
  return new Error(`LLM API HTTP ${status}: ${String(body || '').slice(0, 500)}`);
}
export function providerErrorMessage(error) {
  const message = error?.message || String(error);
  if (error?.code === 'TIMEOUT') {
    return 'API AI phản hồi quá lâu. Hãy kiểm tra kết nối mạng và trạng thái nhà cung cấp, rồi thử gửi lại.';
  }
  if (error?.code === 'UNREACHABLE' || error?.name === 'ProviderOfflineError' || /fetch failed|failed to fetch|networkerror|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT/i.test(message)) {
    return 'Chưa kết nối được với API AI nên chưa thể trả lời. Hãy kiểm tra kết nối mạng, địa chỉ API và dịch vụ AI có đang chạy không trong Cài đặt → Nhà cung cấp, rồi thử gửi lại.';
  }
  if (error?.code === 'AUTH') {
    return 'API AI từ chối xác thực hoặc quyền truy cập. Hãy kiểm tra API key và quyền sử dụng trong Cài đặt → Nhà cung cấp, rồi thử gửi lại.';
  }
  return `Lỗi: ${message}`;
}
