"use client";

import { useEffect, useState } from "react";

// Fetches GET /api/me/summary from the browser on purpose: Reclaim's in-app webview captures
// this request after login and proves predicates over its response.
interface Summary {
  status: string;
  country: string;
  age_ok: boolean;
  band_ge_1: boolean;
  band_ge_2: boolean;
  band_ge_3: boolean;
}

interface Labels {
  accountStatus: string;
  st_active: string;
  st_suspended: string;
  st_closed: string;
  ageOk: string;
  ageNo: string;
  band: string;
  bandNone: string;
  country: string;
  loading: string;
}

const COUNTRY: Record<string, string> = { AR: "Argentina", NG: "Nigeria", KE: "Kenya" };

export function AccountStatus({ labels }: { labels: Labels }) {
  const [s, setS] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/me/summary", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setS)
      .catch(() => setFailed(true));
  }, []);

  if (!s) {
    return (
      <section className="card">
        <h2>{labels.accountStatus}</h2>
        <p className="muted">{failed ? "—" : labels.loading}</p>
      </section>
    );
  }

  const band = s.band_ge_3 ? 3 : s.band_ge_2 ? 2 : s.band_ge_1 ? 1 : 0;
  const statusLabel = s.status === "active" ? labels.st_active : s.status === "suspended" ? labels.st_suspended : labels.st_closed;
  return (
    <section className="card">
      <h2>{labels.accountStatus}</h2>
      <ul className="checks">
        <Check ok={s.status === "active"} text={statusLabel} />
        <Check ok={s.age_ok} text={s.age_ok ? labels.ageOk : labels.ageNo} />
        <li className="check neutral">
          <span className="icon" aria-hidden="true">·</span>
          {labels.band}: <strong>{band ? `${band} / 3` : labels.bandNone}</strong>
        </li>
        <li className="check neutral">
          <span className="icon" aria-hidden="true">·</span>
          {labels.country}: <strong>{COUNTRY[s.country] ?? s.country}</strong>
        </li>
      </ul>
    </section>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={`check ${ok ? "ok" : "bad"}`}>
      <span className="icon" aria-hidden="true">{ok ? "✓" : "✕"}</span>
      {text}
    </li>
  );
}
