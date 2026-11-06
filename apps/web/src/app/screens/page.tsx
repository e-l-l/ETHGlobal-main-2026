import type { Metadata } from "next";
import { Main, Row, Screen, TopBar } from "@/jar/app";
import { jarViewport } from "@/lib/viewport";
import { routes, verifyingHref, failedHref } from "@/lib/routes";

export const metadata: Metadata = { title: "All screens" };
export const viewport = jarViewport("dark");

const GROUPS: { group: string; screens: { id: string; title: string; href: string }[] }[] = [
  {
    group: "Merchant onboarding",
    screens: [
      { id: "M01", title: "Welcome", href: routes.welcome },
      { id: "M02", title: "Prove your business", href: routes.prove },
      { id: "M03", title: "Verifying", href: verifyingHref() },
      { id: "M04", title: "Business Pass", href: routes.pass },
      { id: "M05", title: "Verification failed", href: failedHref("too-new") },
      { id: "M06", title: "Create your shop", href: routes.shop },
    ],
  },
  {
    group: "Customer",
    screens: [
      { id: "C01", title: "Scan and pay", href: routes.pay },
      { id: "C02", title: "Paid", href: routes.paid },
    ],
  },
  {
    group: "Demo seller portal",
    screens: [
      { id: "X01", title: "Portal login", href: routes.portalLogin },
      { id: "X02", title: "Portal dashboard", href: routes.portal },
    ],
  },
  {
    group: "Lender and risk taker",
    screens: [
      { id: "L01", title: "Earn", href: routes.earn },
      { id: "L02", title: "Deposit or withdraw", href: routes.deposit },
      { id: "L03", title: "My position", href: routes.position },
      { id: "R01", title: "Junior vault", href: routes.junior },
      { id: "R02", title: "Mint or redeem", href: routes.mint },
      { id: "R03", title: "Trade JAR-J", href: routes.trade },
    ],
  },
  {
    group: "Public",
    screens: [
      { id: "P02", title: "Protocol", href: routes.protocol },
      { id: "P03", title: "Risk status", href: routes.risk },
      { id: "P04", title: "Explorer", href: routes.explorer },
    ],
  },
  {
    group: "Merchant app (Person A)",
    screens: [
      { id: "M07", title: "Agent setup", href: routes.agent.setup },
      { id: "M10", title: "Home", href: routes.home },
      { id: "P01", title: "World view", href: routes.worldView },
    ],
  },
];

export default function Page() {
  return (
    <Screen>
      <TopBar back={routes.welcome} title="All screens" world={false} />
      <Main enter="none">
        {GROUPS.map((g) => (
          <section key={g.group} className="dj-stack" style={{ gap: 8 }} aria-label={g.group}>
            <h2 className="dj-label" style={{ margin: 0 }}>
              {g.group}
            </h2>
            <ul className="app-rows">
              {g.screens.map((s) => (
                <li key={s.id}>
                  <Row href={s.href} lead={<span className="dj-mono" style={{ fontSize: 11 }}>{s.id}</span>} title={s.title} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Main>
    </Screen>
  );
}
