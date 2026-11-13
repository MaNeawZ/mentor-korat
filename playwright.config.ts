import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:3000",
    channel:
      process.env.BROWSER_CHANNEL ||
      (process.platform === "win32" ? "msedge" : undefined),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  reporter: "list",
  outputDir: "test-results/browser",
  webServer: {
    command:
      process.platform === "win32" ? "npm.cmd run start" : "npm run start",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
  },
});
