"use client";

import { CsrfField } from "../CsrfField";

export function LogoutButton({ label }: { label: string }) {
  return (
    <form method="post" action="/api/auth/logout">
      <CsrfField />
      <button className="btn ghost" type="submit">
        {label}
      </button>
    </form>
  );
}
