import { LANG_COOKIE, serializeCookie } from "@/lib/cookies";
import { redirect303 } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/lang?l=es&next=/dashboard: sets the UI language. `next` must be a local path. */
export function GET(req: Request): Response {
  const url = new URL(req.url);
  const l = url.searchParams.get("l") === "en" ? "en" : "es";
  const next = url.searchParams.get("next") ?? "/";
  const safeNext = /^\/(?![/\\])[\w\-/?=&]*$/.test(next) ? next : "/";
  return redirect303(req, safeNext, [serializeCookie(LANG_COOKIE, l, { maxAge: 60 * 60 * 24 * 365 })]);
}
