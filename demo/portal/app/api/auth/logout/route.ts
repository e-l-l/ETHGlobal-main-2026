import { CSRF_COOKIE, SESSION_COOKIE, readCookie, serializeCookie } from "@/lib/cookies";
import { sameOrigin, verifyCsrf } from "@/lib/csrf";
import { json, redirect303 } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return json({ error: "bad_origin" }, 403);
  const form = await req.formData().catch(() => null);
  if (!verifyCsrf(readCookie(req.headers.get("cookie"), CSRF_COOKIE), String(form?.get("csrf") ?? ""))) {
    return json({ error: "csrf" }, 403);
  }
  return redirect303(req, "/login", [
    serializeCookie(SESSION_COOKIE, "", { maxAge: 0 }),
    serializeCookie(CSRF_COOKIE, "", { maxAge: 0 }),
  ]);
}
