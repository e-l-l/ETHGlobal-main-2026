import { defineConfig } from "@playwright/test";

const PORT = 3101;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/final/components`,
    env: { NEXT_PUBLIC_SHOW_KIT: "1" },
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
