import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as csrfGET } from "@/app/api/auth/csrf/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { GET as summaryGET } from "@/app/api/me/summary/route";
import { GET as healthGET } from "@/app/api/health/route";
import { GET as langGET } from "@/app/api/lang/route";
import { resetRateLimits } from "@/lib/rateLimit";
import { createSessionToken } from "@/lib/session";
import { loadAccounts } from "@/lib/accounts";
import { SUMMARY_PATH, providerConfig } from "@/lib/reclaim";

const BASE = "http://localhost:3000";

function setCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}
function cookieValue(res: Response, name: string): string | undefined {
  const c = setCookies(res).find((s) => s.startsWith(`${name}=`));
  return c ? decodeURIComponent(c.split(";")[0].slice(name.length + 1)) : undefined;
}

async function csrf(): Promise<string> {
  const res = csrfGET();
  return ((await res.json()) as { csrf: string }).csrf;
}

async function login(email: string, password: string, opts: { token?: string; formToken?: string; ip?: string; origin?: string } = {}) {
  const token = opts.token ?? (await csrf());
  const body = new URLSearchParams({ email, password, csrf: opts.formToken ?? token });
  return loginPOST(
    new Request(`${BASE}/api/auth/login`, {
      method: "POST",
      body,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `dp_csrf=${encodeURIComponent(token)}`,
        host: "localhost:3000",
        origin: opts.origin ?? BASE,
        "x-forwarded-for": opts.ip ?? "203.0.113.7",
      },
    }),
  );
}

beforeEach(() => resetRateLimits());
afterEach(() => vi.unstubAllEnvs());

describe("login", () => {
  it("works with the right password and sets a hardened session cookie", async () => {
    const res = await login("donpepe@example.com", "donpepe-demo-2026");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${BASE}/dashboard`);
    const c = setCookies(res).find((s) => s.startsWith("dp_session="))!;
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(c).toMatch(/Path=\//);
    expect(c).not.toMatch(/acc_/); // opaque: no account id in the cookie
  });

  it("is case-insensitive on email", async () => {
    const res = await login("DonPepe@Example.com", "donpepe-demo-2026");
    expect(res.headers.get("location")).toBe(`${BASE}/dashboard`);
  });

  it("fails with a bad password, an unknown email or an empty password", async () => {
    for (const [e, p] of [
      ["donpepe@example.com", "wrong"],
      ["nobody@example.com", "donpepe-demo-2026"],
      ["donpepe@example.com", ""],
    ]) {
      const res = await login(e, p);
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(`${BASE}/login?error=invalid`);
      expect(cookieValue(res, "dp_session")).toBeUndefined();
    }
  });

  it("every seeded account can log in", async () => {
    const pw: Record<string, string> = {
      "donpepe@example.com": "donpepe-demo-2026",
      "nkechi@example.com": "nkechi-demo-2026",
      "wanjiru@example.com": "wanjiru-demo-2026",
      "newshop@example.com": "newshop-demo-2026",
      "suspended@example.com": "suspended-demo-2026",
    };
    for (const a of loadAccounts()) {
      const res = await login(a.email, pw[a.email], { ip: `198.51.100.${a.email.length}` });
      expect(res.headers.get("location"), a.email).toBe(`${BASE}/dashboard`);
    }
  });

  it("rejects a missing or mismatched CSRF token", async () => {
    const t = await csrf();
    const res = await login("donpepe@example.com", "donpepe-demo-2026", { token: t, formToken: "x" });
    expect(res.headers.get("location")).toBe(`${BASE}/login?error=csrf`);
    // a forged (unsigned) token in both cookie and form also fails
    const forged = await login("donpepe@example.com", "donpepe-demo-2026", { token: "abc.def" });
    expect(forged.headers.get("location")).toBe(`${BASE}/login?error=csrf`);
  });

  it("rejects a cross-origin POST", async () => {
    const res = await login("donpepe@example.com", "donpepe-demo-2026", { origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });

  it("is rate limited per IP", async () => {
    for (let i = 0; i < 10; i++) await login("nkechi@example.com", "nope", { ip: "192.0.2.1" });
    const res = await login("nkechi@example.com", "nkechi-demo-2026", { ip: "192.0.2.1" });
    expect(res.headers.get("location")).toBe(`${BASE}/login?error=rate`);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("is rate limited per email across IPs", async () => {
    for (let i = 0; i < 10; i++) await login("wanjiru@example.com", "nope", { ip: `192.0.2.${i + 10}` });
    const res = await login("wanjiru@example.com", "wanjiru-demo-2026", { ip: "192.0.2.99" });
    expect(res.headers.get("location")).toBe(`${BASE}/login?error=rate`);
  });

  it("marks cookies Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "x".repeat(48));
    const res = await login("donpepe@example.com", "donpepe-demo-2026");
    expect(setCookies(res).find((s) => s.startsWith("dp_session="))).toMatch(/; Secure/);
  });

  it("logout clears the session (CSRF-protected)", async () => {
    const t = await csrf();
    const res = await logoutPOST(
      new Request(`${BASE}/api/auth/logout`, {
        method: "POST",
        body: new URLSearchParams({ csrf: t }),
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: `dp_csrf=${encodeURIComponent(t)}`, origin: BASE, host: "localhost:3000" },
      }),
    );
    expect(res.status).toBe(303);
    expect(setCookies(res).find((s) => s.startsWith("dp_session="))).toMatch(/Max-Age=0/);
    const noToken = await logoutPOST(new Request(`${BASE}/api/auth/logout`, { method: "POST", body: new URLSearchParams({}) }));
    expect(noToken.status).toBe(403);
  });
});

describe("GET /api/me/summary", () => {
  const get = (cookie?: string, path = SUMMARY_PATH) =>
    summaryGET(new Request(`${BASE}${path}`, { headers: cookie ? { cookie } : {} }));

  it("needs a session", async () => {
    const res = get();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects a tampered or expired session", () => {
    const tok = createSessionToken("acc_18bf65eab2bc1711af938e15a335f20c");
    const tampered = tok.slice(0, -2) + (tok.endsWith("A") ? "BB" : "AA");
    expect(get(`dp_session=${tampered}`).status).toBe(401);
    const expired = createSessionToken("acc_18bf65eab2bc1711af938e15a335f20c", Math.floor(Date.now() / 1000) - 9 * 3600);
    expect(get(`dp_session=${expired}`).status).toBe(401);
  });

  it("returns the compact summary for the logged-in account, after a real login", async () => {
    const lr = await login("donpepe@example.com", "donpepe-demo-2026");
    const session = cookieValue(lr, "dp_session")!;
    const res = get(`dp_session=${encodeURIComponent(session)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const text = await res.text();
    expect(text).toBe(JSON.stringify(JSON.parse(text))); // compact: no whitespace between tokens
    expect(text.startsWith('{"v":1,"status":"active","country":"AR","age_ok":true,"band_ge_1":true,"band_ge_2":true,"band_ge_3":false,')).toBe(true);
  });

  it("rejects any query string (no identifiers can be smuggled into the proven URL)", () => {
    const tok = createSessionToken("acc_18bf65eab2bc1711af938e15a335f20c");
    expect(get(`dp_session=${tok}`, `${SUMMARY_PATH}?account_id=acc_18bf65eab2bc1711af938e15a335f20c`).status).toBe(400);
    expect(get(`dp_session=${tok}`, `${SUMMARY_PATH}?`).status).toBe(200); // empty search is fine
  });
});

describe("the proven URL contains no account identifier", () => {
  it("the path is a constant with no dynamic segment", () => {
    expect(SUMMARY_PATH).toBe("/api/me/summary");
    expect(SUMMARY_PATH).not.toMatch(/[\[\]{}:?=]/);
  });

  it("is identical for every account and contains none of their identifiers", () => {
    const urls = new Set(loadAccounts().map(() => providerConfig("https://demo-portal.example", 2).url));
    expect(urls.size).toBe(1);
    const url = [...urls][0];
    for (const a of loadAccounts()) {
      for (const secret of [a.id, a.email, a.business_name, a.id.replace("acc_", "")]) {
        expect(url.toLowerCase()).not.toContain(secret.toLowerCase());
      }
    }
  });
});

describe("misc endpoints", () => {
  it("health is ok in dev", async () => {
    const res = healthGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, service: "demo-portal", accounts_loaded: true });
  });

  it("health is 503 in production without SESSION_SECRET", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "");
    expect(healthGET().status).toBe(503);
  });

  it("lang switch refuses open redirects", () => {
    const ok = langGET(new Request(`${BASE}/api/lang?l=en&next=/dashboard`));
    expect(ok.headers.get("location")).toBe(`${BASE}/dashboard`);
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
      const res = langGET(new Request(`${BASE}/api/lang?l=en&next=${encodeURIComponent(bad)}`));
      expect(res.headers.get("location")).toBe(`${BASE}/`);
    }
  });
});
