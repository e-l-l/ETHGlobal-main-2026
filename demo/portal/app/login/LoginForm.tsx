"use client";

import { useCallback, useState } from "react";
import { CsrfField } from "../CsrfField";

export function LoginForm(props: { labels: { email: string; password: string; signIn: string; signingIn: string } }) {
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const onReady = useCallback((ok: boolean) => setReady(ok), []);
  const { labels } = props;
  return (
    <form method="post" action="/api/auth/login" className="form" onSubmit={() => setSubmitting(true)}>
      <CsrfField onReady={onReady} />
      <label className="field">
        <span>{labels.email}</span>
        <input name="email" type="email" autoComplete="username" inputMode="email" required autoCapitalize="none" />
      </label>
      <label className="field">
        <span>{labels.password}</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <button className="btn primary" type="submit" disabled={!ready || submitting}>
        {submitting ? labels.signingIn : labels.signIn}
      </button>
    </form>
  );
}
