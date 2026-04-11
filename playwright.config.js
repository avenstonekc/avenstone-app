// @ts-check
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 60000,
  retries: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "test-results/html" }]],
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    baseURL: "http://localhost:3737",
  },
  workers: 1, // Run tests sequentially — they share DB state
  webServer: {
    command: "npx serve . -p 3737 -s",
    port: 3737,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
