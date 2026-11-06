"use client";

import { useEffect, useState } from "react";

/** Hidden CSRF input. Fetches a signed double-submit token (the endpoint also sets the matching httpOnly cookie). */
export function CsrfField({ onReady }: { onReady?: (ready: boolean) => void }) {
  const [token, setToken] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { csrf?: string }) => {
        if (alive && d.csrf) {
          setToken(d.csrf);
          onReady?.(true);
        }
      })
      .catch(() => onReady?.(false));
    return () => {
      alive = false;
    };
  }, [onReady]);
  return <input type="hidden" name="csrf" value={token} />;
}
