import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  outputDir: process.env.PW_OUT,
  timeout: 90_000,
  workers: 3,
  reporter: [["line"]],
  use: { baseURL: "http://localhost:3001" },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
