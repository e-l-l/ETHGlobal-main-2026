import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppHeader, Label, Ledger, ListRow, Page, PageHead, RowList } from "@/final";
import { routes } from "@/lib/routes";
import { SCREEN_GROUPS } from "@/lib/screens-list";

export const metadata: Metadata = { title: "All screens" };

export default function Page_() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SHOW_KIT !== "1") notFound();
  return (
    <>
      <AppHeader home={routes.home} />
      <Page>
        <PageHead back={routes.home} label="Dev" title="All screens">
          Every route with its canvas ID.
        </PageHead>
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
          {SCREEN_GROUPS.map((g) => (
            <section key={g.group} aria-label={g.group} className="flex min-w-0 flex-col gap-2">
              <Label as="h2">{g.group}</Label>
              <RowList>
                {g.screens.map((s) => (
                  <ListRow key={s.id + s.title} href={s.href} lead={<Ledger className="text-hunter">{s.id}</Ledger>} title={s.title} sub={<Ledger className="text-charcoal-muted">{s.href}</Ledger>} />
                ))}
              </RowList>
            </section>
          ))}
        </div>
      </Page>
    </>
  );
}
