import { accountFromRequest, json } from "@/lib/auth";
import { buildSummary, serializeSummary } from "@/lib/summary";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/summary: the zkTLS "whoami" endpoint.
 *
 * - The account is taken ONLY from the session cookie. The URL carries no identifier, because
 *   Reclaim's claimInfo.parameters (URL included) are public onchain.
 * - Query strings are rejected, so nobody can accidentally put an identifier into the proven URL.
 * - The body is compact JSON with a fixed key order (see lib/summary.ts). Do not change it
 *   without updating lib/reclaim.ts, the README and the Reclaim provider.
 */
export function GET(req: Request): Response {
  if (new URL(req.url).search !== "") {
    return json({ error: "no_query_params" }, 400);
  }
  const account = accountFromRequest(req);
  if (!account) return json({ error: "unauthorized" }, 401, { Vary: "Cookie" });

  return new Response(serializeSummary(buildSummary(account)), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      Vary: "Cookie",
    },
  });
}
