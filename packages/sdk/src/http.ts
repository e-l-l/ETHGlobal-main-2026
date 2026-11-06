import { ApiError, NetworkError, normaliseBackendCode } from "./errors.js";

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpOptions = {
  /** Base URL, no trailing slash needed. */
  baseUrl: string;
  /** Service name used in error messages ("agents-api", "issuer"). */
  service: string;
  fetch?: FetchFn;
  timeoutMs?: number;
};

export type RequestOptions = {
  body?: unknown;
  /** Bearer token. Sent as a header only, never logged or put in an error. */
  token?: string;
  /**
   * Raw `Authorization` header value (e.g. `Owner <issuedAt>:<signature>`), for schemes other than Bearer.
   * Wins over `token` when both are set. Never logged or put in an error.
   */
  authorization?: string;
  signal?: AbortSignal;
  query?: Record<string, string | number | undefined>;
};

export type Http = {
  readonly baseUrl: string;
  request<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, opts?: RequestOptions): Promise<T>;
};

/** Minimal JSON-over-HTTP client with typed, secret-free errors. */
export function createHttp(opts: HttpOptions): Http {
  const baseUrl = opts.baseUrl.replace(/\/+$/, "");
  const doFetch: FetchFn = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = opts.timeoutMs ?? 20_000;

  return {
    baseUrl,
    async request<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, ro: RequestOptions = {}): Promise<T> {
      let url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
      if (ro.query) {
        const q = Object.entries(ro.query).filter(([, v]) => v !== undefined) as [string, string | number][];
        if (q.length) url += `?${q.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&")}`;
      }
      const headers: Record<string, string> = { accept: "application/json" };
      if (ro.body !== undefined) headers["content-type"] = "application/json";
      if (ro.authorization) headers.authorization = ro.authorization;
      else if (ro.token) headers.authorization = `Bearer ${ro.token}`;

      const ctl = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        ctl.abort();
      }, timeoutMs);
      const onAbort = () => ctl.abort();
      ro.signal?.addEventListener("abort", onAbort, { once: true });

      let res: Response;
      try {
        res = await doFetch(url, {
          method,
          headers,
          body: ro.body === undefined ? undefined : toJson(ro.body),
          signal: ctl.signal,
        });
      } catch (e) {
        // `e` may carry the URL but never the body or token; keep it as `cause` for debugging.
        if (timedOut) throw new NetworkError("timeout", opts.service, e);
        if (ro.signal?.aborted) throw new NetworkError("aborted", opts.service, e);
        throw new NetworkError("network_unreachable", opts.service, e);
      } finally {
        clearTimeout(timer);
        ro.signal?.removeEventListener("abort", onAbort);
      }

      if (res.status === 204) return undefined as T;
      let data: unknown = undefined;
      const text = await res.text().catch(() => "");
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          if (res.ok) throw new NetworkError("bad_response", opts.service);
        }
      }
      if (!res.ok) {
        const d = data as { detail?: unknown; error?: unknown } | undefined;
        throw new ApiError(opts.service, res.status, normaliseBackendCode(d?.detail ?? d?.error, res.status));
      }
      return data as T;
    },
  };
}

const BIG = "\u0000big:";

/**
 * JSON with bigints written as exact integer literals. FastAPI `StrictInt` fields (field elements, uint256)
 * reject strings, and Python parses arbitrary-size JSON integers exactly, so `123…` must stay a bare number.
 */
export function toJson(value: unknown): string {
  const s = JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? `${BIG}${v.toString()}` : v));
  return s.replace(/"\\u0000big:(-?\d+)"/g, "$1");
}
