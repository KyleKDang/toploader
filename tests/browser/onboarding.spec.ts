import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  browserPrompts,
  fakeBrowserPrompts,
  offerInstall,
} from './browser-prompts';
import { INSTALL_STEP_KEY, signInAsNewTrader } from './session';

/*
 * The Onboarding flow, end to end at 375px: attest to being 18 or over, sign
 * up with email, set a display name, pick the area, take or skip the install
 * step, land on Matches.
 *
 * Wiring only. That the attestation is required and that a Trader can only
 * set their own profile are proven at seam 1 (tests/db/traders.test.ts).
 */
test('a new Trader signs up, sets up their profile in Orange County, installs with alerts, and lands on an empty Matches view', async ({
  page,
}) => {
  await fakeBrowserPrompts(page);
  const email = `trader-${randomUUID()}@example.test`;

  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-up$/);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('I am 18 or over').check();
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await page.getByLabel('6-digit code').fill(await readSignInCode(email));
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/set-up-profile$/);
  await page.getByLabel('Display name').fill('Priya R.');
  await page.getByLabel('Area').selectOption({ label: 'Orange County' });
  await page.getByRole('button', { name: 'Start trading' }).click();

  // Nothing is asked of the browser until the Trader taps.
  await expect(page).toHaveURL(/\/install$/);
  await offerInstall(page);
  const install = page.getByRole('button', {
    name: 'Install and turn on alerts',
  });
  await expect(install).toBeVisible();
  expect(await browserPrompts(page)).toEqual([]);
  await install.click();

  await expect(page).toHaveURL(/\/$/);
  expect(await browserPrompts(page)).toEqual(['notifications', 'install']);
  await expect(page.getByText('No matches in Orange County yet')).toBeVisible();

  const tabs = page.getByRole('navigation', { name: 'Sections' });
  for (const name of ['Matches', 'Search']) {
    await expect(tabs.getByRole('button', { name })).toBeEnabled();
  }
  for (const name of ['Trades', 'Profile']) {
    await expect(tabs.getByRole('button', { name })).toBeDisabled();
  }
});

test.describe('on an iPhone', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });

  test('the install step shows Add to Home Screen instructions, and skipping it lands on Matches for good', async ({
    page,
  }) => {
    await fakeBrowserPrompts(page);
    await signInAsNewTrader(page, 'Orange County');
    await page.evaluate(
      (key) => localStorage.removeItem(key),
      INSTALL_STEP_KEY,
    );

    await page.goto('/');
    await expect(page).toHaveURL(/\/install$/);
    await expect(
      page.getByRole('heading', { name: 'Install to get trade alerts' }),
    ).toBeVisible();
    await expect(page.getByText('Add to Home Screen')).toBeVisible();

    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Matches' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Matches' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    expect(await browserPrompts(page)).toEqual([]);
  });
});

/**
 * The sign-in code the local stack emailed to `email`, read from Mailpit, the
 * mail catcher `supabase start` runs. This is the local stack, not an
 * external service, so it is not faked.
 */
async function readSignInCode(email: string): Promise<string> {
  const mailpit = process.env.MAILPIT_URL;
  if (!mailpit)
    throw new Error(
      'MAILPIT_URL is missing; run this through playwright.config.ts',
    );

  const deadline = Date.now() + 10_000;
  for (;;) {
    const search = (await (
      await fetch(
        `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
      )
    ).json()) as { messages: { ID: string }[] };
    const id = search.messages[0]?.ID;
    if (id) {
      const message = (await (
        await fetch(`${mailpit}/api/v1/message/${id}`)
      ).json()) as { Text: string };
      const code = /\b(\d{6})\b/.exec(message.Text)?.[1];
      if (!code) throw new Error(`No 6-digit code in: ${message.Text}`);
      return code;
    }
    if (Date.now() > deadline) throw new Error(`No email reached ${email}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
