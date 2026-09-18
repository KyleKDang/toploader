import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

/*
 * The Onboarding flow, end to end at 375px: sign up with email, attest to
 * being 18 or over, set a display name, pick the City, land on Matches.
 *
 * Wiring only. That the attestation is required and that a Trader can only
 * set their own profile are proven at seam 1 (tests/db/traders.test.ts).
 */
test('a new Trader signs up, sets up their profile in Orange County, and lands on an empty Matches view', async ({
  page,
}) => {
  const email = `trader-${randomUUID()}@example.test`;

  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-up$/);

  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await page.getByLabel('6-digit code').fill(await readSignInCode(email));
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/set-up-profile$/);
  await page.getByLabel('Display name').fill('Priya R.');
  await page.getByLabel('City').selectOption({ label: 'Orange County' });
  await page.getByLabel('I am 18 or over').check();
  await page.getByRole('button', { name: 'Start trading' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('No Matches in Orange County yet')).toBeVisible();

  const tabs = page.getByRole('navigation', { name: 'Sections' });
  await expect(tabs.getByRole('button', { name: 'Matches' })).toBeEnabled();
  for (const name of ['Search', 'Trades', 'Profile']) {
    await expect(tabs.getByRole('button', { name })).toBeDisabled();
  }
});

/**
 * The sign-in code the local stack emailed to `email`, read from Mailpit, the
 * mail catcher `supabase start` runs. This is the local stack, not an
 * external service, so it is not faked.
 */
async function readSignInCode(email: string): Promise<string> {
  const mailpit = process.env.MAILPIT_URL;
  if (!mailpit) throw new Error('MAILPIT_URL is set by playwright.config.ts');

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
