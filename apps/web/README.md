# web: DripMoni app

The Next.js app for every DripMoni surface: merchant onboarding and app, customer pay page, demo seller portal, lender and junior views, and the public dashboard. For what the product is, see the [root README](../../README.md).

## Run

From the repo root (installs and starts the shared packages too):

```sh
pnpm install
pnpm exec turbo run dev --filter=web...
```

Then open <http://localhost:3001/home>.

| Script (`pnpm --filter web <script>`) | What it does |
|---|---|
| `dev` | Dev server on port 3001 |
| `build` / `start` | Production build and serve |
| `lint` | ESLint, `--max-warnings 0` |
| `check-types` | `next typegen && tsc --noEmit` |
| `test:e2e` | Playwright: builds, serves on port 3101, visits every route at 390px and 1440px, runs axe |

## Source map

| Path | Holds |
|---|---|
| `src/app/` | Routes (App Router). `merchant/(app)` uses the merchant shell; `merchant/(focus)` is for full-screen steps such as Agent Pass approval. |
| `src/app/final/components/` | Component gallery. 404 in production unless `NEXT_PUBLIC_SHOW_KIT=1`. |
| `src/app/icon.svg`, `apple-icon.png`, `favicon.ico` | App icons (the ribbon drop on Hunter), picked up automatically by Next.js |
| `src/final/` | The design system: text, buttons, surfaces, status, controls, brand (logo), patterns, data, shell and domain pieces. Import from `@/final`. |
| `src/screens/` | Larger screen compositions shared by several routes |
| `src/lib/routes.ts` | Every route path. Link with `routes.*` only. |
| `src/lib/brand.ts` | Product name and domain. The name is never hard-coded anywhere else. |
| `src/lib/copy.ts`, `lang.ts` | UI copy in English and Spanish |
| `src/lib/mock/` | Demo data (shop, merchant) until the contracts are live |
| `src/lib/cn.ts` | `cn()` = clsx + tailwind-merge, configured with our custom tokens |
| `e2e/` | Playwright tests |

## Conventions

- **Styling:** Tailwind v4 utilities only. Tokens come from `@repo/tailwind-config` (`theme.css`, `final.css`). No hex values or hand-written CSS in components.
- **Variants:** `cva`. Merge classes with `cn()`. When you add a token, register it in `src/lib/cn.ts`.
- **Money:** dollars first in Urbanist with `tabular-nums`, then the local amount in mono, prefixed `≈`.
- **Copy:** short sentences that translate cleanly. Say "flat fee", never "interest" or "APR" (see [ux.md](../../anay-docs/ux.md)).
- **Accessibility:** 44px minimum touch targets, visible focus rings, `prefers-reduced-motion` respected, and axe must pass in e2e.
- **Privacy markup:** mark onchain elements and on-device elements so the World view overlay can label them (`src/lib/world-view.ts`).
