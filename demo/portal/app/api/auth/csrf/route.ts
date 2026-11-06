import { CSRF_COOKIE, serializeCookie } from "@/lib/cookies";
import { issueCsrfToken } from "@/lib/csrf";
import { json } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Issues a signed double-submit CSRF token: httpOnly cookie + the same value in the body. */
export function GET(): Response {
  const token = issueCsrfToken();
  return json({ csrf: token }, 200, { "Set-Cookie": serializeCookie(CSRF_COOKIE, token, { maxAge: 60 * 60 }) });
}
