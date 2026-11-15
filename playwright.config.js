import { defineConfig, devices } from '@playwright/test';

// Tests de bout en bout : vraie API (PostgreSQL de test) + front Vite, dans Chromium.
// Base : E2E_DATABASE_URL (par défaut celle de la CI).
const DATABASE_URL = process.env.E2E_DATABASE_URL || 'postgres://messous@localhost:5432/messous';
const API_PORT = 3101;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'ordinateur', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.js/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.js/ },
  ],
  webServer: [
    {
      command: 'node src/index.js',
      cwd: './api',
      port: API_PORT,
      reuseExistingServer: false,
      env: {
        DATABASE_URL,
        JWT_SECRET: 'e2e_secret_e2e_secret_e2e_secret_123',
        PORT: String(API_PORT),
        TZ: 'Europe/Paris',
        REGISTER_LIMIT: '1000',
        APP_URL: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      // Build de production servi par « vite preview » (pas de rechargement à chaud pendant les tests)
      command: `npx vite build && npx vite preview --port ${WEB_PORT} --strictPort`,
      timeout: 120_000,
      port: WEB_PORT,
      reuseExistingServer: false,
      env: { VITE_API_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
