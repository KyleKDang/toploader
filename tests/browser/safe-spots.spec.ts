import { expect, test } from '@playwright/test';
import { signInAsNewTrader } from './session.ts';

/*
 * The Safe Spot directory, end to end at 375px: a Trader in Orange County
 * opens it and sees Orange County's Safe Spots, as supabase/seed.sql seeds
 * them on the local stack.
 *
 * Wiring only. That a Trader sees only their own City's Safe Spots, and that
 * no client can write one, is proven at seam 1 (tests/db/safe-spots.test.ts).
 */
test("a Trader opens the Safe Spot directory and sees their City's Safe Spots", async ({
  page,
}) => {
  await signInAsNewTrader(page, 'Orange County');
  await page.goto('/safe-spots');

  await expect(page.getByRole('heading', { name: 'Safe Spots' })).toBeVisible();
  await expect(page.getByText('Orange County')).toBeVisible();

  const spots = page
    .getByRole('list', { name: 'Safe Spots' })
    .getByRole('listitem');
  await expect(spots).toHaveCount(2);
  await expect(spots.nth(0)).toContainText('Example Mall, north entrance');
  await expect(spots.nth(0)).toContainText('Monitored site');
  await expect(spots.nth(1)).toContainText('Example Police Station');
  await expect(spots.nth(1)).toContainText('100 Example Way, Irvine, CA 92618');
  await expect(spots.nth(1)).toContainText('Police station');
  await expect(page.getByText('Test City Police Station')).toHaveCount(0);

  const tabs = page.getByRole('navigation', { name: 'Sections' });
  await expect(tabs.getByRole('button', { name: 'Trades' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
