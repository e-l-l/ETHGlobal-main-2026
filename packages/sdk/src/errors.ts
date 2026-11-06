/**
 * Typed errors. Every failure the SDK surfaces is an `MRAError` with a stable `code` the UI can branch on.
 *
 * Messages never contain request bodies, tokens, proofs, credential secrets or response bodies:
 * the backend returns stable codes only (`{"detail": "<code>"}` / `{"error": "<code>"}`) and we keep just that.
 */

export type ErrorCode =
  // network (the request never got a usable HTTP response)
  | "network_unreachable"
  | "timeout"
  | "aborted"
  | "bad_response"
  // HTTP status classes, when the backend gave no code
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "unprocessable"
  | "rate_limited"
  | "upstream_failed"
  | "server_error"
  // backend codes we name explicitly (any other backend code passes through as a string)
  | "invalid_request"
  | "bad_state"
  | "predicate_failed"
  | "proof_replayed"
  // SDK-side
  | "config_invalid"
  | "not_supported"
  | "wallet_required"
  | "session_missing"
  | "prover_not_configured"
  | "adapter_not_configured"
  | "anon_rpc_unavailable"
  | "chain_read_failed"
  | "chain_write_failed"
  | "vault_locked"
  | "vault_corrupt"
  | (string & {});

export class MRAError extends Error {
  readonly code: ErrorCode;
  readonly status?: number;
  constructor(code: ErrorCode, message?: string, opts: { status?: number; cause?: unknown } = {}) {
    super(message ?? code, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "MRAError";
    this.code = code;
    if (opts.status !== undefined) this.status = opts.status;
  }
}

/** The request did not reach the server or no response came back. `code`: network_unreachable | timeout | aborted. */
export class NetworkError extends MRAError {
  readonly service: string;
  constructor(code: "network_unreachable" | "timeout" | "aborted" | "bad_response", service: string, cause?: unknown) {
    super(code, `${service}: ${code.replace("_", " ")}`, { cause });
    this.name = "NetworkError";
    this.service = service;
  }
}

/** The server answered with an error status. `code` is the backend's stable code when it sent one. */
export class ApiError extends MRAError {
  readonly service: string;
  readonly status: number;
  constructor(service: string, status: number, code: ErrorCode) {
    super(code, `${service}: HTTP ${status} ${code}`, { status });
    this.name = "ApiError";
    this.service = service;
    this.status = status;
  }
}

export class ConfigError extends MRAError {
  constructor(code: ErrorCode, message: string) {
    super(code, message);
    this.name = "ConfigError";
  }
}

export class ChainError extends MRAError {
  constructor(code: "chain_read_failed" | "chain_write_failed" | "wallet_required" | "anon_rpc_unavailable", message: string, cause?: unknown) {
    super(code, message, { cause });
    this.name = "ChainError";
  }
}

export class VaultError extends MRAError {
  constructor(code: "vault_locked" | "vault_corrupt" | "session_missing", message: string) {
    super(code, message);
    this.name = "VaultError";
  }
}

export class NotSupportedError extends MRAError {
  constructor(what: string, mode: string) {
    super("not_supported", `${what} is not available in ${mode} mode`);
    this.name = "NotSupportedError";
  }
}

export function isMRAError(e: unknown): e is MRAError {
  return e instanceof MRAError;
}

/** Map an HTTP status to a code when the body carried none. */
export function codeForStatus(status: number): ErrorCode {
  if (status === 400) return "bad_request";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "unprocessable";
  if (status === 429) return "rate_limited";
  if (status === 502 || status === 503 || status === 504) return "upstream_failed";
  return status >= 500 ? "server_error" : "bad_request";
}

/** Backend detail strings are stable codes. Normalise the agents API's prose ones to codes. */
export function normaliseBackendCode(raw: unknown, status: number): ErrorCode {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 80) return codeForStatus(status);
  if (/^[a-z0-9_:{}|-]+$/.test(raw)) return raw; // e.g. "rate_limited", "predicate_failed:age_ok"
  // api.py uses short English sentences for a few routes.
  const prose: Record<string, ErrorCode> = {
    "Invalid request": "invalid_request",
    "Invalid request or policy violation": "invalid_request",
    "Not found": "not_found",
    "Rate limit exceeded": "rate_limited",
    "Upstream service failed": "upstream_failed",
  };
  return prose[raw] ?? codeForStatus(status);
}
