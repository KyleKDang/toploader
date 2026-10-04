import { expect, test } from '@playwright/test';
import { arrangeCity, signInAsNewTrader } from './session.ts';

/*
 * Unblocking, end to end at 375px: a Trader who has blocked another opens
 * Settings from the Profile tab, finds that Trader under Blocked traders,
 * and unblocks them.
 *
 * Wiring only. Whose block an unblock removes, who may remove it, and what
 * comes back once it is gone are proven at seam 1 (tests/db/blocks.test.ts).
 * The block is arranged through the API, since this flow starts after it.
 */

test('a Trader unblocks another from Settings', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  const otherPage = await (await browser.newContext()).newPage();
  const city = await arrangeCity();
  const trader = await signInAsNewTrader(page, city, 'Blocker');
  const blocked = await signInAsNewTrader(otherPage, city, 'Blocked Trader');
  const { error } = await trader.client.rpc('block_trader', {
    trader_id: blocked.id,
  });
  if (error) throw error;

  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: 'Profile' })
    .click();
  const section = page.getByRole('region', { name: 'Blocked traders' });
  await expect(section).toContainText('Blocked Trader');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBe(0);

  await section.getByRole('button', { name: 'Unblock Blocked Trader' }).click();

  await expect(section).toContainText('You have not blocked anyone.');
  const { data, error: readError } = await trader.client
    .from('blocks')
    .select('blocked_id');
  if (readError) throw readError;
  expect(data).toEqual([]);
});
