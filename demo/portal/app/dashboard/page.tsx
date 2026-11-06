import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LANG_COOKIE, SESSION_COOKIE } from "@/lib/cookies";
import { accountFromToken } from "@/lib/auth";
import { balances, dailyTotals, payoutSettings, recentTransactions, weeklyTotals, type Transaction } from "@/lib/ledger";
import { dateTime, money, pickLang, t, type Dict } from "@/lib/i18n";
import { Brand, LangSwitch } from "../ui";
import { SalesChart } from "./SalesChart";
import { AccountStatus } from "./AccountStatus";
import { LogoutButton } from "./LogoutButton";

export const dynamic = "force-dynamic";

function methodLabel(tx: Transaction, d: Dict): string {
  if (tx.kind === "payout") return d.payout;
  if (tx.method.startsWith("card:")) return `${d.m_card} •••• ${tx.method.slice(5)}`;
  const key = `m_${tx.method}` as keyof Dict;
  return (d[key] as string | undefined) ?? d.sale;
}

export default async function Dashboard() {
  const jar = await cookies();
  const account = accountFromToken(jar.get(SESSION_COOKIE)?.value);
  if (!account) redirect("/login");

  const lang = pickLang(jar.get(LANG_COOKIE)?.value, account.locale, (await headers()).get("accept-language"));
  const d = t(lang);
  const now = new Date();
  const b = balances(account, now);
  const weeks = weeklyTotals(dailyTotals(account, now));
  const txs = recentTransactions(account, now, 8);
  const payout = payoutSettings(account);
  const delta = b.prev_30d_cents > 0 ? Math.round(((b.last_30d_cents - b.prev_30d_cents) / b.prev_30d_cents) * 100) : null;

  return (
    <div className="app">
      <header className="topbar">
        <Brand d={d} />
        <div className="topbar-right">
          <span className="demo-pill inline">{d.demo}</span>
          <LangSwitch lang={lang} next="/dashboard" />
          <LogoutButton label={d.logout} />
        </div>
      </header>

      <main className="content">
        <h1 className="greeting">
          {d.hello}, {account.business_name}
        </h1>

        {account.status !== "active" && (
          <p className="alert" role="alert">
            {d.suspendedBanner}
          </p>
        )}

        <section className="kpis">
          <div className="card kpi hero">
            <span className="kpi-label">{d.available}</span>
            <span className="kpi-value">{money(account.status === "active" ? b.available_cents : 0, lang)}</span>
            <span className="kpi-foot">
              {d.pending}: {money(b.pending_cents, lang)}
            </span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{d.sales30}</span>
            <span className="kpi-value">{money(b.last_30d_cents, lang)}</span>
            <span className="kpi-foot">
              {delta !== null && (
                <span className={delta >= 0 ? "up" : "down"}>
                  {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
                </span>
              )}{" "}
              {delta !== null ? d.vsPrev : ""} · {b.sales_count_30d} {d.salesCount}
            </span>
          </div>
        </section>

        <div className="grid2">
          <section className="card">
            <h2>{d.chartTitle}</h2>
            <p className="muted small">{d.chartSub}</p>
            <SalesChart weeks={weeks} lang={lang} d={d} />
          </section>

          <AccountStatus
            labels={{
              accountStatus: d.accountStatus,
              st_active: d.st_active,
              st_suspended: d.st_suspended,
              st_closed: d.st_closed,
              ageOk: d.ageOk,
              ageNo: d.ageNo,
              band: d.band,
              bandNone: d.bandNone,
              country: d.country,
              loading: d.loading,
            }}
          />
        </div>

        <div className="grid2">
          <section className="card">
            <h2>{d.recent}</h2>
            {txs.length === 0 ? (
              <p className="muted">{d.noActivity}</p>
            ) : (
              <ul className="txs">
                {txs.map((tx) => (
                  <li key={tx.id}>
                    <div>
                      <div className="tx-title">{methodLabel(tx, d)}</div>
                      <div className="muted small">
                        {dateTime(tx.at, lang)} · #{tx.id}
                      </div>
                    </div>
                    <div className={`tx-amt ${tx.cents < 0 ? "neg" : "pos"}`}>
                      {tx.cents < 0 ? "−" : "+"}
                      {money(Math.abs(tx.cents), lang)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2>{d.payoutSettings}</h2>
            <dl className="settings">
              <dt>{d.destination}</dt>
              <dd>{payout.destination}</dd>
              <dt>{d.schedule}</dt>
              <dd>{payout.schedule === "daily" ? d.daily : d.weekly}</dd>
              <dt>{d.holder}</dt>
              <dd>{payout.holder}</dd>
            </dl>
            <button className="btn ghost" type="button" disabled>
              {d.edit}
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}
