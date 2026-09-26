import { expect, test } from '@playwright/test';
import { signInAsNewTrader } from './session';

/*
 * The PWA installability smoke check the spec's Testing decisions name, and
 * the offline shell. Both are asked of Chrome itself: its own installability
 * verdict over the DevTools protocol, and a real reload with the network cut.
 */

test('the app passes the browser installability checks', async ({ page }) => {
  await page.goto('/');
  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active?.scriptURL;
  });
  expect(worker).toMatch(/\/sw\.js$/);

  const cdp = await page.context().newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest');
  expect(manifest.errors).toEqual([]);
  expect(JSON.parse(manifest.data ?? '{}')).toMatchObject({
    name: 'Toploader',
    short_name: 'Toploader',
    display: 'standalone',
    start_url: '/',
  });
  const { installabilityErrors } = await cdp.send(
    'Page.getInstallabilityErrors',
  );
  expect(installabilityErrors).toEqual([]);
});

test('the offline shell loads with the network cut', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);

  await context.setOffline(true);

  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Email me a code' }),
  ).toBeVisible();

  // A path the browser has never loaded gets the same shell, and the router
  // takes it from there.
  await page.goto('/wants');
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(
    page.getByRole('button', { name: 'Email me a code' }),
  ).toBeVisible();
});

test('a signed-in Trader offline is told so, and back online tries again into Matches', async ({
  page,
  context,
}) => {
  await signInAsNewTrader(page, 'Orange County');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Matches' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("You're offline.")).toBeVisible();

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Matches' })).toBeVisible();
});
