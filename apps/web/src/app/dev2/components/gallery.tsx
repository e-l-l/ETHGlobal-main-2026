"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button, Chips, PacePicker, Pill, ProgressBar, RepaymentRing, Segmented, SettingRow, SplitBar, SplitLegend, StepsList, Toggle, type Pace } from "@/jar/controls";
import {
  AgentDecision,
  ApprovalDenied,
  BadWeek,
  BottomNav,
  BusinessPass,
  JarCard,
  LiveSales,
  LossWaterfall,
  MandateEditor,
  PixelDune,
  ShopQR,
  StandingPass,
  WaveHeader,
  type Layer,
  type Sale,
} from "@/jar/domain";
import { HoldToConfirm, SlideToApprove } from "@/jar/gestures";
import { JarMark, Lockup } from "@/jar/mark";
import { arsText, usdText } from "@/jar/format";

/* ---------------------------------------------------------------- fixtures */

const NORMAL = {
  shop: "Luna Kiosco",
  shopId: "shop_7f3a",
  reason1: "Your balance is low before Thursday, when you usually restock.",
  reason2: "Sales this week match your usual pace.",
  reason3: "You chose stock as the purpose. $100 is inside your limit.",
  repaid: 46,
  total: 115,
};
/* Worst case: the longest names, biggest numbers and wordiest reasons we'd plausibly see. */
const WORST = {
  shop: "Almacén, Kiosco y Polirrubro Los Tres Hermanos de Villa Crespo",
  shopId: "shop_7f3a9c21e4b8d06f5a3c9e71b2d48f60a1c3e5b7",
  reason1:
    "Tu saldo está bajo antes del jueves, cuando normalmente reponés mercadería, y las ventas de los últimos catorce días fueron un 38% más altas que el promedio del mes anterior por la temporada.",
  reason2: "Sales this week match your usual pace, including one unusually large sale of $1,234.56 that the Critic checked and accepted.",
  reason3: "Purpose: stock. Supplier: Distribuidora Mayorista Hermanos Rodríguez e Hijos S.R.L.",
  repaid: 1234567.89,
  total: 9876543.21,
};

const DAYS = [32, 41, 28, 0, 55, 61, 38, 44, 30, 12, 48, 70, 66, 35, 40, 52, 47, 0, 58, 63, 71, 45, 39, 50, 57, 62, 49, 30, 66, 74];

const SALES: Sale[] = [
  { id: 1, amount: 10, time: "11:42" },
  { id: 2, amount: 4.5, time: "11:18" },
  { id: 3, amount: 22, time: "10:57" },
];

/* --------------------------------------------------------------- helpers */

function Section({ id, title, note, children }: { id: string; title: string; note: string; children: ReactNode }) {
  return (
    <section id={id} className="dj-section" aria-labelledby={`${id}-h`}>
      <header>
        <h2 id={`${id}-h`} className="dj-h1">
          {title}
        </h2>
        <p className="dj-small">{note}</p>
      </header>
      {children}
    </section>
  );
}

function Spec({ name, note, children }: { name: string; note?: string; children: ReactNode }) {
  return (
    <div className="dj-spec">
      <div className="dj-stack" style={{ gap: 2 }}>
        <h3 className="dj-mono" style={{ margin: 0, color: "var(--text)", fontWeight: 600 }}>
          {name}
        </h3>
        {note ? <p className="dj-small">{note}</p> : null}
      </div>
      <div className="dj-spec__box">{children}</div>
    </div>
  );
}

const SWATCHES = [
  ["--bg", "ground"],
  ["--card", "card"],
  ["--card-2", "card 2"],
  ["--text", "text"],
  ["--text-2", "text 2"],
  ["--text-3", "text 3"],
  ["--accent", "accent"],
  ["--btn", "button"],
  ["--strong", "control edge"],
  ["--track", "track"],
  ["--unlit", "unlit band"],
  ["--jar-bg", "jar"],
  ["--warn", "warn"],
  ["--risk", "risk"],
] as const;

/* ----------------------------------------------------------------- gallery */

export function Gallery2() {
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const [world, setWorld] = useState(false);
  const [worst, setWorst] = useState(false);
  const [pace, setPace] = useState<Pace>("usual");
  const [approve, setApprove] = useState<"idle" | "approved" | "denied">("idle");
  const [slideKey, setSlideKey] = useState(0);
  const [revoked, setRevoked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<Layer>("senior");
  const [cap, setCap] = useState("100");
  const [voiceSetting, setVoiceSetting] = useState(true);
  const [jar, setJar] = useState(NORMAL.repaid);

  const f = worst ? WORST : NORMAL;
  const repaid = worst ? WORST.repaid : jar;
  const total = f.total;

  // Status bar follows the app mode, not the OS scheme (mobile-native).
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", mode === "dark" ? "#262e24" : "#d6f0a8");
  }, [mode]);

  const daysLeft = { slow: 24, usual: 12, busy: 8 };

  return (
    <div className={`dj${world ? " wv" : ""}`} data-app={mode === "light" ? "light" : undefined}>
      <div className="dj-topbar">
        <div className="dj-topbar__in">
          <Lockup size={28} />
          <span className="dj-mono" style={{ color: "var(--text-3)" }}>
            kit v2 · /dev2/components
          </span>
          <div style={{ flex: "1 1 220px", maxWidth: 240 }}>
            <Segmented
              label="App mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
              ]}
            />
          </div>
          <div className="dj-row" style={{ gap: 20, flexWrap: "wrap" }}>
            <label className="dj-row" style={{ gap: 10, minHeight: 44 }}>
              <Toggle checked={world} onChange={setWorld} label="World view" />
              <span style={{ fontWeight: 600 }} aria-hidden>
                World view
              </span>
            </label>
            <label className="dj-row" style={{ gap: 10, minHeight: 44 }}>
              <Toggle checked={worst} onChange={setWorst} label="Worst-case data" />
              <span style={{ fontWeight: 600 }} aria-hidden>
                Worst case
              </span>
            </label>
          </div>
        </div>
      </div>
      <p role="status" className="sr-only-dj">
        {world ? "World view on. Dashed outlines are public onchain. Striped covers stay on this device." : ""}
      </p>

      <main className="dj-gallery" id="dj-main">
        <div className="dj-stack" style={{ gap: 12, paddingTop: 40 }}>
          <p className="dj-label">anay-design.md v0.6 · built with skills-anay</p>
          <h1 className="dj-display-xl">Every sale fills the jar.</h1>
          <p className="dj-body" style={{ maxWidth: 640 }}>
            Dark-first, five greens, every shape means something. Flip World view to see what is public. Flip Worst case to try to break it.
          </p>
        </div>

        {/* ---------------------------------------------------- foundations */}
        <Section id="foundations" title="Foundations" note="Tokens from section 3. Lime is only ever a fill on Charcoal or Hunter.">
          <div className="dj-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 120px), 1fr))" }}>
            {SWATCHES.map(([v, l]) => (
              <div key={v} className="dj-swatch">
                <span style={{ background: `var(${v})` }} />
                <span className="dj-mono">{l}</span>
                <span className="dj-label" style={{ textTransform: "none", letterSpacing: 0 }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
          <div className="dj-grid">
            <Spec name="Type" note="Urbanist display, Figtree body, JetBrains Mono ledger. Body stays 16px on phones.">
              <span className="dj-display-xl">$1,150</span>
              <span className="dj-h1">Your agent drew $100</span>
              <span className="dj-h2">Today&apos;s sales</span>
              <p className="dj-body">You repay $115 in total. About 12 days at your usual pace.</p>
              <span className="dj-label">Ledger label</span>
              <span className="dj-local">≈ ARS 87.264</span>
            </Spec>
            <Spec name="Ribbon drop: the logo is a meter" note="Lit bands = tier + 1. Under 24px it becomes the solid drop.">
              <div className="dj-row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
                {([0, 1, 2, 3, 4] as const).map((n) => (
                  <div key={n} className="dj-stack" style={{ alignItems: "center", gap: 4 }}>
                    <JarMark lit={n} variant="meter" size={48} label={`${n} bands lit`} />
                    <span className="dj-label">{n}</span>
                  </div>
                ))}
              </div>
              <div className="dj-row" style={{ gap: 16, flexWrap: "wrap", color: "var(--text)" }}>
                <JarMark size={40} label="Primary mark" />
                <JarMark size={20} label="Small solid mark" />
                <JarMark size={16} label="Smallest solid mark" />
                <JarMark size={40} loading label="Saving" />
                <span className="dj-small">← loading: bands light bottom to top, 8s loop</span>
              </div>
              <Lockup />
            </Spec>
            <Spec name="Jar gradient" note="One per screen. Text never sits on it.">
              <div>
                <div className="dj-hero-grad" />
                <div className="dj-card" style={{ borderRadius: "0 0 16px 16px" }}>
                  <span className="dj-h2">Text sits below, on a solid ground.</span>
                </div>
              </div>
            </Spec>
          </div>
        </Section>

        {/* ------------------------------------------------------- controls */}
        <Section id="controls" title="Controls" note="Feedback on press (scale 0.97, 160ms). Hover only where a fine pointer exists. 44px targets.">
          <div className="dj-grid">
            <Spec name="Buttons" note="Loading crossfades the label with a 2px blur so the swap reads as one change.">
              <Button>Set up your agent</Button>
              <Button variant="ghost">Preview the pay screen</Button>
              <Button variant="danger">Revoke agent</Button>
              <Button
                loading={busy}
                loadingLabel="Saving limits"
                onClick={() => {
                  setBusy(true);
                  setTimeout(() => setBusy(false), 1600);
                }}
              >
                Save limits
              </Button>
              <Button disabled>Nothing to save</Button>
            </Spec>
            <Spec name="Pills" note="Mono 11, uppercase, 15% tint of their own colour.">
              <div className="dj-row" style={{ flexWrap: "wrap", gap: 8 }}>
                <Pill kind="saving">Saving</Pill>
                <Pill kind="locked">Jar locked</Pill>
                <Pill kind="repaying">Repaying</Pill>
                <Pill kind="slow">Slow</Pill>
                <Pill kind="risk">Written off</Pill>
              </div>
            </Spec>
            <Spec name="Segmented · chips · toggle" note="Segmented thumb slides (200ms ease-in-out): it shows where the choice went.">
              <Segmented
                label="Currency"
                value={cap === "100" ? "usd" : "ars"}
                onChange={(v) => setCap(v === "usd" ? "100" : "250")}
                options={[
                  { value: "usd", label: "Dollars" },
                  { value: "ars", label: "Pesos" },
                ]}
              />
              <Chips
                label="Most per advance"
                value={cap}
                onChange={setCap}
                options={[
                  { value: "50", label: "$50" },
                  { value: "100", label: "$100" },
                  { value: "250", label: "$250" },
                  { value: "500", label: "$500" },
                ]}
              />
              <SettingRow title="Read sales out loud" hint="Voice announcements on this phone" checked={voiceSetting} onChange={setVoiceSetting} />
            </Spec>
            <Spec name="Pace picker" note="Always all three. Selected tile is filled.">
              <PacePicker value={pace} onChange={setPace} days={daysLeft} />
              <ProgressBar value={(NORMAL.repaid / NORMAL.total) * 100} label="Repaid so far" />
              <p className="dj-small">About {daysLeft[pace]} days at a {pace} pace.</p>
            </Spec>
            <Spec name="Steps list" note="Check for done, accent dot for now, track dot for next.">
              <StepsList
                steps={[
                  { label: "Reading the dashboard", state: "done" },
                  { label: "Checking it privately", detail: "Nobody can see the numbers", state: "current" },
                  { label: "Writing only four facts", state: "next" },
                ]}
              />
            </Spec>
          </div>
        </Section>

        {/* ---------------------------------------------------------- money */}
        <Section id="money" title="Money" note="Say the number once. Dollars first, local under it, then what happens next.">
          <div className="dj-grid">
            <Spec name="Jar card" note="Honeydew in dark mode, Hunter with a lime figure in light.">
              <JarCard
                label="Your jar"
                amount={repaid}
                status="Repaying"
                statusKind="repaying"
                repaid={repaid}
                total={total}
                next={`${usdText(repaid, 2)} of ${usdText(total, 2)} repaid. About ${daysLeft[pace]} days at your usual pace.`}
              />
            </Spec>
            <Spec name="Repayment ring" note="r 54, stroke 12, round cap.">
              <div className="dj-row" style={{ gap: 20, flexWrap: "wrap" }}>
                <RepaymentRing paid={repaid} total={total}>
                  <span className="dj-stack" style={{ gap: 0 }}>
                    <span style={{ fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 22 }}>{Math.round((repaid / total) * 100)}%</span>
                    <span className="dj-label">repaid</span>
                  </span>
                </RepaymentRing>
                <dl className="dj-kv" style={{ flex: "1 1 160px" }}>
                  <div>
                    <dt>Advance</dt>
                    <dd>$100</dd>
                  </div>
                  <div>
                    <dt>Flat fee</dt>
                    <dd>$15</dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>$115</dd>
                  </div>
                </dl>
              </div>
            </Spec>
            <Spec name="Split bar" note="9:1 with a 3px gap. The lime band is the 10%.">
              <SplitBar />
              <SplitLegend you="$9.00" jar="$1.00" />
            </Spec>
            <Spec name="Pixel dune" note="Columns are days. Today in text colour. Empty days still show a track.">
              <PixelDune days={DAYS} />
              <div className="dj-between">
                <span className="dj-label">30 days</span>
                <span className="dj-mono">{arsText(DAYS.reduce((a, b) => a + b, 0))}</span>
              </div>
            </Spec>
          </div>
        </Section>

        {/* ---------------------------------------------------------- agent */}
        <Section id="agent" title="Agent" note="Agents propose, the contract decides. Every draw says why, and which fence it stayed inside.">
          <div className="dj-grid">
            <Spec name="Slide to approve (M08)" note="Drag, flick, or press Enter. A flick past 90% completes. Grab it mid-settle and it follows your finger.">
              {approve === "denied" ? (
                <ApprovalDenied
                  onRetry={() => {
                    setApprove("idle");
                    setSlideKey((k) => k + 1);
                  }}
                />
              ) : (
                <>
                  <dl className="dj-kv priv">
                    <div>
                      <dt>Per advance</dt>
                      <dd>$100</dd>
                    </div>
                    <div>
                      <dt>Per month</dt>
                      <dd>$250</dd>
                    </div>
                    <div>
                      <dt>For</dt>
                      <dd>Stock, paid to supplier</dd>
                    </div>
                  </dl>
                  <SlideToApprove key={slideKey} label="Slide to approve with World" doneLabel="Agent approved" onComplete={() => setApprove("approved")} />
                  <div className="dj-row" style={{ flexWrap: "wrap" }}>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setApprove("denied");
                      }}
                    >
                      Simulate World denial
                    </Button>
                    {approve === "approved" ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setApprove("idle");
                          setSlideKey((k) => k + 1);
                        }}
                      >
                        Reset
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            </Spec>
            <Spec name="Advance arrived (M11)" note="Reasons open by default on the arrival screen.">
              <AgentDecision
                kind="drew"
                when="Today 09:12"
                title="Your agent drew $100 for stock"
                reasons={[f.reason1, f.reason2, f.reason3]}
                limits={[
                  { label: "Per advance", used: 100, cap: 100 },
                  { label: "This month", used: 100, cap: 250 },
                ]}
                defaultOpen
              />
            </Spec>
            <Spec name="Activity log entry (M14)" note="Collapsed in the log. No animation on open: it's opened tens of times a day.">
              <AgentDecision
                kind="declined"
                when="Yesterday"
                title="The Critic declined a $250 draw"
                reasons={["Most sales came from 2 payers in 20 minutes, just before the request.", "Nothing was drawn. Your limits did not change."]}
              />
              <AgentDecision kind="waited" when="Mon" title="No draw today" reasons={["Your balance covers Thursday's restock."]} />
            </Spec>
            <Spec name="Set up your agent (M07)" note="Caps above your tier are not offered at all.">
              <MandateEditor tierCap={250} />
            </Spec>
            <Spec name="Revoke (M15)" note="Hold for 2s. Release snaps back in 200ms. Space or Enter works too.">
              {revoked ? (
                <div className="dj-stack" role="status">
                  <Pill kind="locked">Revoked</Pill>
                  <p className="dj-body">Your agent can&apos;t draw anything. Your current advance keeps repaying from sales.</p>
                  <Button variant="ghost" onClick={() => setRevoked(false)}>
                    Reset demo
                  </Button>
                </div>
              ) : (
                <HoldToConfirm holdingLabel="Keep holding…" onConfirm={() => setRevoked(true)}>
                  Revoke agent
                </HoldToConfirm>
              )}
            </Spec>
          </div>
        </Section>

        {/* -------------------------------------------------------- passes */}
        <Section id="passes" title="Passes and hard weeks" note="The privacy promise, said at the moment it matters.">
          <div className="dj-grid">
            <Spec name="Business Pass (M04)">
              <BusinessPass
                facts={[
                  { k: "Country", v: "Argentina" },
                  { k: "Revenue band", v: "2" },
                  { k: "Selling for", v: "6+ months" },
                ]}
              />
            </Spec>
            <Spec name="Standing Pass (M16)" note="The logo is the meter. Two bands lit = tier 1.">
              <StandingPass tier={1} repaid={1} />
            </Spec>
            <Spec name="Bad week (M13)">
              <BadWeek days={{ usual: 12, now: 19 }} />
            </Spec>
          </div>
        </Section>

        {/* ------------------------------------------------- customer, public */}
        <Section id="public" title="Customer and lender" note="The customer never sees an advance. Lenders see where they sit in the loss order.">
          <div className="dj-grid">
            <Spec name="Pay header (C01)" note="Wave band, lime on Hunter.">
              <WaveHeader>
                <span className="dj-label" style={{ color: "var(--lime-pale)" }}>
                  Pay
                </span>
                <span className="dj-h1 dj-wrap">{f.shop}</span>
                <span style={{ fontFamily: "var(--f-display)", fontWeight: 800, fontSize: 40, color: "var(--lime)" }}>$10</span>
              </WaveHeader>
              <Button>Pay 10 USDT</Button>
              <p className="dj-small">This screen is only a payment. Nothing else about the shop is here.</p>
            </Spec>
            <Spec name="Shop QR (M06)" note="Plain, no centre dot. Charcoal on Lime Pale in both modes.">
              <ShopQR name={f.shop} id={f.shopId} url={`https://dollarjar.example/pay/${f.shopId}`} />
            </Spec>
            <Spec name="Loss waterfall" note="Your own layer is filled.">
              <Segmented
                label="View as"
                value={viewer}
                onChange={setViewer}
                options={[
                  { value: "junior", label: "Junior" },
                  { value: "senior", label: "Senior" },
                ]}
              />
              <LossWaterfall viewer={viewer} />
            </Spec>
          </div>
        </Section>

        {/* ---------------------------------------------------- composition */}
        <Section id="home" title="Composed: Home (M10)" note="Everything above on one phone. Simulate a sale: the row slides in, the jar and the ring move, the voice reads it out.">
          <div className="dj-row" style={{ alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
            <div className="dj-phone">
              <div className="dj-phone__body">
                <div className="dj-between" style={{ alignItems: "center" }}>
                  <Lockup size={24} />
                  <span className="dj-mono pub dj-wrap" style={{ maxWidth: "50%", textAlign: "right" }}>
                    {f.shopId}
                  </span>
                </div>
                <JarCard
                  label="Your jar"
                  amount={repaid}
                  status="Repaying"
                  statusKind="repaying"
                  repaid={repaid}
                  total={total}
                  next={`About ${daysLeft.usual} days at your usual pace. No penalty if sales slow.`}
                />
                <div className="dj-card" style={{ gap: 10 }}>
                  <div className="dj-between">
                    <span className="dj-label">Last 30 days</span>
                    <span className="dj-mono">{usdText(DAYS.reduce((a, b) => a + b, 0))}</span>
                  </div>
                  <PixelDune days={DAYS} rows={8} />
                </div>
                <LiveSales
                  initial={SALES}
                  worst={worst}
                  onSale={(amount) => setJar((j) => Math.min(NORMAL.total, Math.round((j + amount * 0.1) * 100) / 100))}
                />
              </div>
              <BottomNav active="home" />
            </div>
          </div>
        </Section>
      </main>
    </div>
  );
}
