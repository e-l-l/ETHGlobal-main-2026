import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/**
 * `@repo/sdk/browser/anon` and `@repo/sdk/browser/prover` are loaded with dynamic import() in
 * src/lib/mra-browser.ts. A bundler still has to resolve them at build time, so while the SDK doesn't ship a
 * built file for a subpath (or with NEXT_PUBLIC_MRA_BROWSER_STUBS=1) it's aliased to a stub that throws, and the app falls
 * back at runtime. The build passes either way.
 */
const BROWSER_SUBPATHS = {
  "@repo/sdk/browser/anon": "./src/lib/mra-fallback/anon.ts",
  "@repo/sdk/browser/prover": "./src/lib/mra-fallback/prover.ts",
} as const;

function exportTarget(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return undefined;
  const e = entry as Record<string, unknown>;
  for (const key of ["browser", "import", "default"]) {
    const t = exportTarget(e[key]);
    if (t) return t;
  }
  return undefined;
}

function sdkShips(specifier: string): boolean {
  try {
    const pkgPath = path.join(process.cwd(), "node_modules/@repo/sdk/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { exports?: Record<string, unknown> };
    const target = exportTarget(pkg.exports?.[`./${specifier.replace("@repo/sdk/", "")}`]);
    return !!target && existsSync(path.join(path.dirname(pkgPath), target));
  } catch {
    return false;
  }
}

const forceStubs = process.env.NEXT_PUBLIC_MRA_BROWSER_STUBS === "1";
const stubs = Object.fromEntries(
  Object.entries(BROWSER_SUBPATHS).filter(([spec]) => forceStubs || !sdkShips(spec)),
);

/** Optional imports of @coinbase/cdp-sdk (via the Coinbase wallet connector) that aren't installed: see the stub. */
const X402 = ["@x402/core/client", "@x402/evm", "@x402/evm/exact/client", "@x402/evm/upto/client", "@x402/svm/exact/client"];
for (const spec of X402) (stubs as Record<string, string>)[spec] = "./src/lib/mra-fallback/x402.ts";

const nextConfig: NextConfig = {
  turbopack: { resolveAlias: stubs },
  webpack(config: { resolve: { alias: Record<string, string> } }) {
    for (const [spec, file] of Object.entries(stubs)) config.resolve.alias[spec] = path.resolve(process.cwd(), file);
    return config;
  },
};

export default nextConfig;
