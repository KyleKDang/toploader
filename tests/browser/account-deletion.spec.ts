import { expect, test } from '@playwright/test';
import { arrangeCity, signInAsNewTrader } from './session.ts';

/*
 * Account deletion, end to end at 375px: a Trader opens Settings from the
 * Profile tab, deletes their account, and is back at sign up with their
 * session refused.
 *
 * Wiring only, and the one place the `delete_account` edge function is
 * called as the app calls it: from a browser, on another origin, through
 * the function the local stack serves. What a deletion removes, what it
 * leaves to the other Trader of a Trade, and who it refuses are proven at
 * seam 2 (tests/functions/delete-account.test.ts).
 */

test('a Trader deletes their account from Settings and is signed out', async ({
  page,
}) => {
  // The first call to a function on a fresh stack waits for the edge runtime
  // to fetch what it imports, which outlasts the default five seconds. The
  // test gets that wait plus room for the steps around it, so the default
  // test timeout cannot cut the wait off before it runs out.
  const coldStartWait = 60_000;
  test.setTimeout(coldStartWait + 60_000);
  const trader = await signInAsNewTrader(page, await arrangeCity());

  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: 'Profile' })
    .click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBe(0);

  await page.getByRole('button', { name: 'Delete account' }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete your account?' });
  await expect(sheet).toContainText('This cannot be undone.');
  await sheet.getByRole('button', { name: 'Delete account' }).click();

  await expect(page).toHaveURL(/\/sign-up$/, { timeout: coldStartWait });
  // The session the browser held is gone with the account: opening the app
  // again lands on sign up rather than inside it.
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-up$/);
  // And the session itself is refused, not merely forgotten by the browser.
  const { error } = await trader.client.from('cities').select('id');
  expect(error?.message).toBe('this account has been deleted');
});
