import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/integration",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:8001" },
  webServer: {
    command:
      "./venv/bin/python -c \"from pathlib import Path; Path('/tmp/campusverse-playwright-integration.db').unlink(missing_ok=True)\" && ./venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001",
    cwd: "../backend",
    env: {
      DATABASE_URL: "sqlite:////tmp/campusverse-playwright-integration.db",
      JWT_SECRET: "playwright-integration-secret",
    },
    url: "http://127.0.0.1:8001/docs",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
