import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const metadata: Metadata = { title: "Screenshots" };
export const dynamic = "force-dynamic";

type Entry = {
  n: number;
  group: string;
  id: string;
  title: string;
  href: string;
  finalPath: Record<string, string>;
  files: Record<string, string>;
  error?: string;
};
type Manifest = { takenAt: string; baseUrl: string; entries: Entry[] };

async function load(): Promise<Manifest | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "public/screenshots/manifest.json"), "utf8"));
  } catch {
    return null;
  }
}

export default async function ScreenshotsPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SHOW_KIT !== "1") notFound();
  const m = await load();

  if (!m) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold">No screenshots yet</h1>
        <p className="mt-2">
          Run <code>pnpm screenshots</code> in <code>apps/web</code> (with <code>pnpm dev</code> running), then reload.
        </p>
      </main>
    );
  }

  const groups = [...new Set(m.entries.map((e) => e.group))];

  return (
    <main className="mx-auto max-w-[1800px] p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Screenshots</h1>
        <p className="text-charcoal-muted">
          {m.entries.length} screens · mobile 390×844 and desktop 1440×900, full page · taken {new Date(m.takenAt).toLocaleString()} from {m.baseUrl}
        </p>
        <nav aria-label="Groups" className="mt-3 flex flex-wrap gap-2 text-sm">
          {groups.map((g) => (
            <a key={g} href={`#${g.replace(/\s+/g, "-")}`} className="rounded-full border border-current/20 px-3 py-1 hover:bg-black/5">
              {g}
            </a>
          ))}
        </nav>
      </header>

      {groups.map((g) => (
        <section key={g} id={g.replace(/\s+/g, "-")} className="mb-12">
          <h2 className="mb-4 border-b border-current/20 pb-2 text-lg font-semibold">{g}</h2>
          <div className="flex flex-col gap-10">
            {m.entries
              .filter((e) => e.group === g)
              .map((e) => (
                <article key={e.n} id={`s${e.n}`}>
                  <h3 className="mb-2 flex flex-wrap items-baseline gap-x-3">
                    <span className="font-mono text-sm text-hunter">#{e.n} · {e.id}</span>
                    <span className="font-semibold">{e.title}</span>
                    <a href={e.href} className="font-mono text-sm underline">
                      {e.href}
                    </a>
                    {e.finalPath.mobile && e.finalPath.mobile !== e.href && (
                      <span className="text-sm text-amber-700">redirected to {e.finalPath.mobile}</span>
                    )}
                    {e.error && <span className="text-sm text-red-700">capture error: {e.error}</span>}
                  </h3>
                  <div className="flex items-start gap-6 overflow-x-auto pb-2">
                    {e.files.mobile && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a href={`/screenshots/${e.files.mobile}`} target="_blank" rel="noreferrer" className="shrink-0">
                        <img src={`/screenshots/${e.files.mobile}`} alt={`${e.title} (mobile)`} loading="lazy" width={390} className="w-[390px] rounded-md border border-current/20" />
                      </a>
                    )}
                    {e.files.desktop && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a href={`/screenshots/${e.files.desktop}`} target="_blank" rel="noreferrer" className="shrink-0">
                        <img src={`/screenshots/${e.files.desktop}`} alt={`${e.title} (desktop)`} loading="lazy" width={900} className="w-[900px] rounded-md border border-current/20" />
                      </a>
                    )}
                  </div>
                </article>
              ))}
          </div>
        </section>
      ))}
    </main>
  );
}
