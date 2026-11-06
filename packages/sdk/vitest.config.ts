import { defineConfig } from "vitest/config";

// `@/…` resolves into apps/web ONLY so test/mock-parity.test.ts can compare the SDK's copied mocks with the
// originals. The SDK source never imports apps/web.
// MRA_WEB_SRC overrides the location (e.g. a copy, before `pnpm install` links apps/web's tsconfig).
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const web = env.MRA_WEB_SRC ?? new URL("../../apps/web/src/", import.meta.url).pathname;

export default defineConfig({
  resolve: { alias: [{ find: /^@\//, replacement: web }] },
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    environment: "node",
  },
});
