import { findById, type Account } from "./accounts";
import { readCookie, SESSION_COOKIE } from "./cookies";
import { readSessionToken } from "./session";

/** The logged-in account for a Request (route handlers), or null. */
export function accountFromRequest(req: Request): Account | null {
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  const id = readSessionToken(token);
  if (!id) return null;
  return findById(id) ?? null;
}

export function accountFromToken(token: string | undefined): Account | null {
  const id = readSessionToken(token);
  return id ? (findById(id) ?? null) : null;
}

export function redirect303(req: Request, path: string, setCookies: string[] = []): Response {
  const headers = new Headers({ Location: new URL(path, req.url).toString(), "Cache-Control": "no-store" });
  for (const c of setCookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 303, headers });
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}
