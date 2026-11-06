import { findByEmail } from "@/lib/accounts";
import { CSRF_COOKIE, SESSION_COOKIE, SESSION_TTL_SEC, readCookie, serializeCookie } from "@/lib/cookies";
import { sameOrigin, verifyCsrf } from "@/lib/csrf";
import { burnPasswordCheck, verifyPassword } from "@/lib/password";
import { clientIp, hit, loginLimits } from "@/lib/rateLimit";
import { createSessionToken } from "@/lib/session";
import { json, redirect303 } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Form POST (application/x-www-form-urlencoded): email, password, csrf.
 * Success -> 303 /dashboard + session cookie. Failure -> 303 /login?error=<code>, no session.
 */
export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return json({ error: "bad_origin" }, 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return redirect303(req, "/login?error=invalid");
  }
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(form.get("password") ?? "").slice(0, 256);
  const csrf = String(form.get("csrf") ?? "");

  if (!verifyCsrf(readCookie(req.headers.get("cookie"), CSRF_COOKIE), csrf)) {
    return redirect303(req, "/login?error=csrf");
  }

  const { max, windowMs } = loginLimits();
  const ipOk = hit(`ip:${clientIp(req)}`, max, windowMs);
  const emailOk = hit(`email:${email}`, max, windowMs);
  if (!ipOk || !emailOk) {
    const res = redirect303(req, "/login?error=rate");
    res.headers.set("Retry-After", String(Math.ceil(windowMs / 1000)));
    return res;
  }

  const account = email ? findByEmail(email) : undefined;
  if (!account) {
    burnPasswordCheck(password); // equalise timing for unknown emails
    return redirect303(req, "/login?error=invalid");
  }
  if (!password || !verifyPassword(password, account.password_hash)) {
    return redirect303(req, "/login?error=invalid");
  }

  return redirect303(req, "/dashboard", [
    serializeCookie(SESSION_COOKIE, createSessionToken(account.id), { maxAge: SESSION_TTL_SEC }),
    serializeCookie(CSRF_COOKIE, "", { maxAge: 0 }), // rotate the CSRF token after login
  ]);
}
