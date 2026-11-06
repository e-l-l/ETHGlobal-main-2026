"use client";

import "./jar.css";
import "./app.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useRef, useState, useTransition, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { I } from "./app-icons";
import { setWorldView, useWorldView } from "./world-view";
import { jarFonts } from "./fonts";

export type Mode = "dark" | "light" | "portal";
const ModeContext = createContext<Mode>("dark");

/* ------------------------------------------------------------------ Screen
 * One phone screen. Owns the .dj token scope, the mode, and the world view class.
 * Layout: top bar, main (grows), then an action bar or a tab bar pinned to the bottom.
 */
export function Screen({ mode = "dark", lang, children }: { mode?: Mode; lang?: string; children: ReactNode }) {
  const wv = useWorldView();
  return (
    <ModeContext.Provider value={mode}>
      <div className={`dj app ${jarFonts}${wv ? " wv" : ""}`} data-app={mode === "dark" ? undefined : mode} lang={lang}>
        {children}
      </div>
    </ModeContext.Provider>
  );
}

export function Main({ children, enter = "stagger", center, tight, label }: { children: ReactNode; enter?: "stagger" | "fade" | "none"; center?: boolean; tight?: boolean; label?: string }) {
  const cls = ["app-main", center && "app-main--center", tight && "app-main--tight", enter === "stagger" ? "app-enter" : enter === "fade" ? "app-fade" : null].filter(Boolean).join(" ");
  return (
    <main id="main" className={cls} aria-label={label}>
      {children}
    </main>
  );
}

/* ----------------------------------------------------------------- TopBar */

export type TopBarProps = {
  /** Where back goes. A link, not history.back(), so a deep link still has a way out. */
  back?: string;
  backLabel?: string;
  title?: ReactNode;
  /** Onboarding progress in place of a title. */
  steps?: { at: number; of: number; label: string };
  start?: ReactNode;
  end?: ReactNode;
  /** Shows the world view switch. Off on screens with nothing public or private to mark. */
  world?: boolean;
  /** One line under the legend: what this screen puts onchain. */
  worldNote?: string;
  brand?: boolean;
  /** The title is the screen's h1 unless the content has its own. */
  heading?: boolean;
};

export function TopBar({ back, backLabel = "Back", title, steps, start, end, world = true, worldNote, brand, heading = true }: TopBarProps) {
  const wv = useWorldView();
  return (
    <>
      <header className={`app-top${brand ? " app-top--brand" : ""}`}>
        <div className="app-top__start">
          {back ? (
            <Link href={back} className="app-icon" aria-label={backLabel}>
              <I.back />
            </Link>
          ) : null}
          {start}
        </div>
        {brand ? null : steps ? (
          <div className="app-steps" role="img" aria-label={steps.label}>
            {Array.from({ length: steps.of }, (_, i) => (
              <span key={i} data-on={i < steps.at} />
            ))}
          </div>
        ) : title === undefined ? (
          <span />
        ) : heading ? (
          <h1 className="app-top__title">{title}</h1>
        ) : (
          <span className="app-top__title">{title}</span>
        )}
        <div className="app-top__end">
          {end}
          {world ? <WorldToggle /> : null}
        </div>
      </header>
      {world && wv ? (
        <div className="app-legend" role="status">
          <span>
            <i className="app-legend__pub" />
            Onchain, anyone can see
          </span>
          <span>
            <i className="app-legend__priv" />
            Only on this phone
          </span>
          {worldNote ? <p>{worldNote}</p> : null}
        </div>
      ) : null}
    </>
  );
}

export function WorldToggle() {
  const wv = useWorldView();
  return (
    <button type="button" className="app-icon" aria-pressed={wv} aria-label="What the world sees" title="What the world sees" onClick={() => setWorldView(!wv)}>
      <I.eye />
    </button>
  );
}

/** ES / EN. Writes the cookie and re-renders on the server; nothing to thread through links. */
export function LangToggle({ lang }: { lang: "en" | "es" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = lang === "es" ? "en" : "es";
  return (
    <button
      type="button"
      className="app-chip"
      aria-label={lang === "es" ? "ES, switch to English" : "EN, cambiar a español"}
      aria-busy={pending || undefined}
      onClick={() => {
        document.cookie = `dj-lang=${next}; path=/; max-age=31536000; samesite=lax`;
        start(() => router.refresh());
      }}
    >
      <I.globe size={14} />
      {lang.toUpperCase()}
    </button>
  );
}

/* -------------------------------------------------------------- ActionBar */

export function ActionBar({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="app-actions">
      {hint ? <p className="app-actions__hint">{hint}</p> : null}
      {children}
    </div>
  );
}

export function LinkButton({ href, variant = "primary", children, className, prefetch }: { href: string; variant?: "primary" | "ghost"; children: ReactNode; className?: string; prefetch?: boolean }) {
  return (
    <Link href={href} prefetch={prefetch} className={`dj-btn${variant === "ghost" ? " dj-btn--ghost" : ""} dj-btn--block${className ? ` ${className}` : ""}`}>
      {children}
    </Link>
  );
}

/* ----------------------------------------------------------------- TabBar */

export type Tab = { key: string; label: string; href: string; icon: ReactNode };
export function TabBar({ tabs, active, label }: { tabs: Tab[]; active: string; label: string }) {
  return (
    <nav className="app-tabs" aria-label={label}>
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === active ? "page" : undefined}>
          {t.icon}
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/* -------------------------------------------------------------------- Row */

export function Row({ href, onClick, lead, title, sub, end, chevron = true, className }: { href?: string; onClick?: () => void; lead?: ReactNode; title: ReactNode; sub?: ReactNode; end?: ReactNode; chevron?: boolean; className?: string }) {
  const inner = (
    <>
      {lead ? <span className="app-row__lead">{lead}</span> : null}
      <span className="app-row__body">
        <span className="app-row__title">{title}</span>
        {sub ? <span className="app-row__sub">{sub}</span> : null}
      </span>
      <span className="app-row__end">
        {end}
        {chevron && (href || onClick) ? <I.next /> : null}
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`app-row${className ? ` ${className}` : ""}`}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={`app-row${className ? ` ${className}` : ""}`} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className={`app-row${className ? ` ${className}` : ""}`} style={{ cursor: "default" }}>{inner}</div>;
}

/* ------------------------------------------------------------------ Sheet
 * Bottom sheet on Radix Dialog (focus trap, Escape, scrim tap). Drag the handle or header down
 * to dismiss: 1:1 tracking, rubber-band upward, momentum projection on release (apple-design §6).
 * The exit keyframe has no `from`, so it starts from wherever the finger left the sheet.
 */
export function Sheet({ trigger, title, description, children, open: controlled, onOpenChange }: { trigger?: ReactNode; title: string; description?: string; children: ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  const mode = useContext(ModeContext);
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = (o: boolean) => {
    if (controlled === undefined) setInner(o);
    onOpenChange?.(o);
  };
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ on: false, id: -1, y0: 0, dy: 0, hist: [] as { y: number; t: number }[] });

  const down = (e: React.PointerEvent) => {
    if (drag.current.on || (e.target as HTMLElement).closest("button:not([data-grab])")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { on: true, id: e.pointerId, y0: e.clientY, dy: 0, hist: [{ y: 0, t: e.timeStamp }] };
    if (ref.current) ref.current.style.transition = "none";
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.on || e.pointerId !== d.id) return;
    const raw = e.clientY - d.y0;
    d.dy = raw < 0 ? Math.max(-14, raw * 0.2) : raw;
    if (ref.current) ref.current.style.transform = `translateY(${d.dy}px)`;
    d.hist.push({ y: d.dy, t: e.timeStamp });
    while (d.hist.length > 2 && e.timeStamp - d.hist[0]!.t > 100) d.hist.shift();
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.on || e.pointerId !== d.id) return;
    d.on = false;
    const el = ref.current;
    if (!el) return;
    const a = d.hist[0]!;
    const b = d.hist[d.hist.length - 1]!;
    const v = b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0; // px per ms
    const projected = d.dy + v * 180;
    if (projected > el.offsetHeight * 0.35) {
      setOpen(false);
      return;
    }
    el.style.transition = "transform 320ms var(--ease-drawer)";
    el.style.transform = "translateY(0)";
    const clear = () => {
      el.style.transition = "";
      el.style.transform = "";
      el.removeEventListener("transitionend", clear);
    };
    el.addEventListener("transitionend", clear);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <div className={`dj app-portal ${jarFonts}`} data-app={mode === "dark" ? undefined : mode}>
          <Dialog.Overlay className="app-scrim" />
          <Dialog.Content ref={ref} className="app-sheet">
            <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
              <div className="app-sheet__grab" aria-hidden />
              <div className="app-sheet__head">
                <Dialog.Title className="dj-h2">{title}</Dialog.Title>
                <Dialog.Close className="app-icon" aria-label="Close">
                  <I.close />
                </Dialog.Close>
              </div>
            </div>
            <div className="app-sheet__body">
              {description ? <Dialog.Description className="dj-small">{description}</Dialog.Description> : <Dialog.Description className="sr-only-dj">{title}</Dialog.Description>}
              {children}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ----------------------------------------------------------------- Keypad
 * For money. A native numeric keyboard covers half the screen and hides the amount;
 * a keypad keeps the number, the token and the button in view at once.
 */
export function pressKey(value: string, key: string, { decimals = 2, maxInt = 6 } = {}) {
  if (key === "del") return value.slice(0, -1);
  if (key === ".") {
    if (decimals === 0 || value.includes(".")) return value;
    return value === "" ? "0." : `${value}.`;
  }
  const [int = "", dec] = value.split(".");
  if (dec !== undefined) return dec.length >= decimals ? value : value + key;
  if (int === "0") return key;
  if (int.length >= maxInt) return value;
  return value + key;
}

export function Keypad({ value, onChange, decimals = 2, label = "Amount keypad" }: { value: string; onChange: (v: string) => void; decimals?: number; label?: string }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimals > 0 ? "." : "", "0", "del"];
  return (
    <div className="app-keypad" role="group" aria-label={label}>
      {keys.map((k, i) =>
        k === "" ? (
          <span key={i} aria-hidden />
        ) : (
          <button key={k} type="button" aria-label={k === "del" ? "Delete" : k === "." ? "Decimal point" : k} onClick={() => onChange(pressKey(value, k, { decimals }))}>
            {k === "del" ? <I.del /> : k}
          </button>
        ),
      )}
    </div>
  );
}

/** "$1,234.5" while typing: keeps what was typed, adds separators to the whole part. */
export function typedUsd(v: string) {
  if (!v) return "$0";
  const [int = "0", dec] = v.split(".");
  const grouped = Number(int).toLocaleString("en-US");
  return `$${grouped}${dec !== undefined ? `.${dec}` : ""}`;
}

/* --------------------------------------------------------------- small bits */

export function DoneMark({ size = 72, label }: { size?: number; label?: string }) {
  return (
    <svg className="app-done" width={size} height={size} viewBox="0 0 72 72" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <circle cx="36" cy="36" r="33" />
      <path d="M22 37l9.5 9.5L51 27" />
    </svg>
  );
}

export function Note({ tone = "info", children }: { tone?: "info" | "warn" | "risk"; children: ReactNode }) {
  return (
    <div className={`app-note${tone === "info" ? "" : ` app-note--${tone}`}`}>
      {tone === "info" ? <I.info /> : <I.alert />}
      <div>{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={`app-stat${className ? ` ${className}` : ""}`}>
      <span className="dj-label">{label}</span>
      <strong>{value}</strong>
      {sub ? <span className="dj-small">{sub}</span> : null}
    </div>
  );
}

/** Tap to copy. Content stays selectable for people who long-press instead. */
export function CopyHash({ value, short, href }: { value: string; short?: boolean; href?: string | undefined }) {
  const [copied, setCopied] = useState(false);
  const text = short ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
  return (
    <span className="dj-row" style={{ gap: 4 }}>
      {href ? (
        <a className="app-hash" href={href} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
          {text}
        </a>
      ) : (
        <span className="app-hash">{text}</span>
      )}
      <button
        type="button"
        className="app-icon"
        aria-label={copied ? "Copied" : "Copy"}
        onClick={() => {
          navigator.clipboard?.writeText(value).then(
            () => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            },
            () => undefined,
          );
        }}
      >
        {copied ? <I.check size={16} /> : <I.copy />}
      </button>
    </span>
  );
}
