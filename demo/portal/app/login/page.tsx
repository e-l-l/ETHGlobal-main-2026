import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LANG_COOKIE, SESSION_COOKIE } from "@/lib/cookies";
import { accountFromToken } from "@/lib/auth";
import { loadAccounts } from "@/lib/accounts";
import { pickLang, t } from "@/lib/i18n";
import { LoginForm } from "./LoginForm";
import { Brand, LangSwitch } from "../ui";

export const dynamic = "force-dynamic";

const ERRORS = { invalid: "err_invalid", csrf: "err_csrf", rate: "err_rate" } as const;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const jar = await cookies();
  if (accountFromToken(jar.get(SESSION_COOKIE)?.value)) redirect("/dashboard");
  const lang = pickLang(jar.get(LANG_COOKIE)?.value, undefined, (await headers()).get("accept-language"));
  const d = t(lang);
  const { error } = await searchParams;
  const errKey = error && error in ERRORS ? ERRORS[error as keyof typeof ERRORS] : null;

  return (
    <main className="login-wrap">
      <div className="login-card">
        <div className="login-head">
          <Brand d={d} />
          <LangSwitch lang={lang} next="/login" />
        </div>
        <h1>{d.loginTitle}</h1>
        <p className="muted">{d.loginSub}</p>
        {errKey && (
          <p className="alert" role="alert">
            {d[errKey]}
          </p>
        )}
        <LoginForm labels={{ email: d.email, password: d.password, signIn: d.signIn, signingIn: d.signingIn }} />
        <details className="demo-accounts">
          <summary>{d.demoAccounts}</summary>
          <ul>
            {loadAccounts().map((a) => (
              <li key={a.id}>
                <code>{a.email}</code>
              </li>
            ))}
          </ul>
          <p className="muted small">{d.demoAccountsNote}</p>
        </details>
      </div>
      <p className="demo-pill">{d.demo}</p>
    </main>
  );
}
