import { defineConfig, devices } from '@playwright/test';
import { readLocalStackStatus } from './tests/local-stack.ts';

/*
 * Seam 3: the browser, kept thin. One happy-path tracer per primary flow,
 * proving wiring only; the business rules under it are proven at seam 1.
 *
 * Like the seam-1 suite, the app under test is pointed at the running local
 * stack, so it can only ever talk to `supabase start`, never a hosted project.
 */
const status = readLocalStackStatus();

// Read by the tracer to fetch the sign-in code the local stack emailed.
process.env.MAILPIT_URL = status.MAILPIT_URL;
// Read by the route-error tracer to plant a session under supabase-js's key.
process.env.SUPABASE_API_URL = status.API_URL;

// A port of its own, so the tracer never reuses a dev server that is
// pointed somewhere else.
const PORT = 5199;

export default defineConfig({
  testDir: 'tests/browser',
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      // 375px, because that is the width the design system is specified at.
      name: 'mobile-375',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
      },
    },
  ],
  /*
   * The production build, not the dev server: it is what a Trader gets, and
   * the dev server's dependency optimizer can reload the page mid-test the
   * first time it meets a new package, which made the tracer flaky.
   */
  webServer: {
    command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: status.API_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
      // Sentry faked at the network edge: a DSN on the preview server itself,
      // whose envelopes a tracer catches with `page.route`. A tracer that
      // does not catch them gets a 404 from the preview server, and nothing
      // ever reaches a real Sentry project.
      VITE_SENTRY_DSN: `http://public@127.0.0.1:${PORT}/1`,
    },
  },
});
