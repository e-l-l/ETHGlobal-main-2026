import { json } from "@/lib/auth";
import { issuerProviderConfig, providerConfig } from "@/lib/reclaim";

export const dynamic = "force-dynamic";

/**
 * Developer helper: paste-ready provider config for this deployment's origin.
 *   GET /api/reclaim/provider-config?band=2               -> set 1 only (public predicates, no capture groups)
 *   GET /api/reclaim/provider-config?band=2&mode=issuer   -> set 1 + set 2 (account_id extraction; issuer-only proofs)
 */
export function GET(req: Request): Response {
  const url = new URL(req.url);
  const b = Number(url.searchParams.get("band") ?? 1);
  const band = (b === 2 || b === 3 ? b : 1) as 1 | 2 | 3;
  const issuer = url.searchParams.get("mode") === "issuer";
  return json(issuer ? issuerProviderConfig(url.origin, band) : providerConfig(url.origin, band));
}
