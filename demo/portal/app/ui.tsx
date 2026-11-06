import type { Dict, Lang } from "@/lib/i18n";

export function Brand({ d }: { d: Dict }) {
  return (
    <div className="brand">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="8" fill="#0e4f4a" />
        <path d="M8 18.5c2.5 2 9.5 2 12-1M9 10h10" stroke="#f4c95d" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      </svg>
      <span>
        <strong>{d.brand}</strong> <span className="brand-sub">{d.sellers}</span>
      </span>
    </div>
  );
}

export function LangSwitch({ lang, next }: { lang: Lang; next: string }) {
  const other: Lang = lang === "es" ? "en" : "es";
  return (
    <a className="lang" href={`/api/lang?l=${other}&next=${encodeURIComponent(next)}`} hrefLang={other}>
      {other.toUpperCase()}
    </a>
  );
}
