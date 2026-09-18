import { expect, test } from '@playwright/test';
import { messageForTrader } from '../../src/lib/errors.ts';

/*
 * A route that fails to load, end to end at 375px: the Trader sees the app's
 * error screen rather than the router's default, the failure reaches Sentry
 * exactly once, and trying again recovers without reloading the page.
 *
 * Wiring only. What the screen says is `messageForTrader`'s concern, so the
 * tracer checks only that its generic line is the one shown.
 *
 * The failure is a stored session whose `user` is null, the one #42 used to
 * prove Sentry on the live site: `currentTraderId` throws reading its id.
 * Sentry is the external service here, so it is faked at the network edge:
 * the tracer build's DSN points at the preview server, and the envelopes it
 * sends there are caught below and never leave the machine.
 */
test('a route that fails to load shows the app error screen, reports once, and recovers on retry', async ({
  page,
}) => {
  const key = authStorageKey();
  const errorEvents: string[] = [];
  await page.route(/\/api\/1\/envelope\//, async (route) => {
    for (const line of (route.request().postData() ?? '').split('\n')) {
      if (isEventItemHeader(line)) errorEvents.push(line);
    }
    await route.fulfill({ status: 200, body: '{}' });
  });

  await page.goto('/sign-up');
  await page.evaluate(
    ([key, session]) => localStorage.setItem(key, session),
    [key, JSON.stringify(sessionWithoutUser())],
  );
  await page.goto('/');

  await expect(
    page.getByText(messageForTrader(new Error('unmapped'))),
  ).toBeVisible();
  await expect(page.getByText('Something went wrong!')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show Error' })).toHaveCount(0);
  await expect(page.getByText('Cannot read properties')).toHaveCount(0);
  await expect.poll(() => errorEvents.length).toBe(1);

  // The failure goes away, and a marker on the window proves that trying
  // again re-runs the route in place rather than reloading the page.
  await page.evaluate((key) => {
    localStorage.removeItem(key);
    (window as Marked).notReloaded = true;
  }, key);
  await page.getByRole('button', { name: 'Try again' }).click();

  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByLabel('Email')).toBeVisible();
  expect(await page.evaluate(() => (window as Marked).notReloaded)).toBe(true);
  expect(errorEvents).toHaveLength(1);
});

/** The window, marked before trying again, to tell whether it reloaded. */
type Marked = { notReloaded?: boolean };

/** supabase-js's default storage key: `sb-` and the API host's first label. */
function authStorageKey() {
  const api = process.env.SUPABASE_API_URL;
  if (!api)
    throw new Error(
      'SUPABASE_API_URL is missing; run this through playwright.config.ts',
    );
  return `sb-${new URL(api).hostname.split('.')[0]}-auth-token`;
}

/** A session that passes supabase-js's shape check but has no user. */
function sessionWithoutUser() {
  return {
    access_token: 'malformed',
    refresh_token: 'malformed',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: null,
  };
}

/** Whether an envelope line is the header of an error event item. */
function isEventItemHeader(line: string) {
  try {
    return (JSON.parse(line) as { type?: unknown }).type === 'event';
  } catch {
    return false;
  }
}
