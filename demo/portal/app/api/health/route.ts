import { loadAccounts } from "@/lib/accounts";
import { json } from "@/lib/auth";
import { isProd, secretConfigured } from "@/lib/secret";

export const dynamic = "force-dynamic";

export function GET(): Response {
  let accountsOk = true;
  try {
    loadAccounts();
  } catch {
    accountsOk = false;
  }
  const secretOk = secretConfigured() || !isProd();
  const ok = accountsOk && secretOk;
  return json(
    { ok, service: "demo-portal", accounts_loaded: accountsOk, session_secret_configured: secretConfigured(), time: new Date().toISOString() },
    ok ? 200 : 503,
  );
}
