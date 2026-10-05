import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  arrangeCity,
  makeFounder,
  signInAsNewTrader,
  verifyTrader,
} from './session.ts';

/*
 * Banning, end to end at 375px: a Founder bans a reported Trader from the
 * reports screen, and the Trader on the other side of a Trade with them
 * sees the ban on their Reputation.
 *
 * Wiring only, and the one place the `ban_trader` edge function is called
 * as the app calls it: from a browser, on another origin, through the
 * function the local stack serves. Who may ban whom is proven at seam 2
 * (tests/functions/ban-trader.test.ts), and what a ban does at seam 1
 * (tests/db/bans.test.ts).
 *
 * The Listing, the Trade, and the report are arranged through the API, and
 * the Founder through a superuser connection: nothing a client can call
 * makes one. Reporting itself has its own tracer (reports.spec.ts).
 */

/** A real 1x1 WebP, the smallest thing the photo bucket accepts. */
const TINY_WEBP = Buffer.from(
  'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
  'base64',
);

test('a Founder bans a reported Trader, and their Reputation shows it', async ({
  browser,
}) => {
  // The first call to a function on a fresh stack waits for the edge runtime
  // to fetch what it imports; see account-deletion.spec.ts.
  const coldStartWait = 60_000;
  test.setTimeout(coldStartWait + 60_000);

  const page = await (await browser.newContext()).newPage();
  const founderPage = await (await browser.newContext()).newPage();
  // Card images are hotlinked from TCGplayer; nothing here is about them.
  for (const p of [page, founderPage]) {
    await p.route('https://tcgplayer-cdn.tcgplayer.com/**', (route) =>
      route.fulfill({ status: 404 }),
    );
  }

  const city = await arrangeCity();
  const targetName = `Target ${randomUUID().slice(0, 8)}`;
  const target = await signInAsNewTrader(
    await (await browser.newContext()).newPage(),
    city,
    targetName,
  );
  const reporter = await signInAsNewTrader(page, city, 'Reporter');
  const founder = await signInAsNewTrader(founderPage, city, 'Founder');
  await Promise.all([
    verifyTrader(target.id),
    verifyTrader(reporter.id),
    makeFounder(founder.id),
  ]);

  // The reporter has offered cash for the target's Listing, and reported
  // the target.
  const { data: card, error: cardError } = await target.client
    .from('cards')
    .select('id, card_variants (id, name)')
    .eq('name', 'Examplemon')
    .single();
  if (cardError) throw cardError;
  const holofoil = card.card_variants.find((v) => v.name === 'Holofoil');
  const photo = {
    path: `${target.id}/${randomUUID()}.webp`,
    thumbnail_path: `${target.id}/${randomUUID()}-thumb.webp`,
  };
  for (const path of [photo.path, photo.thumbnail_path]) {
    const { error } = await target.client.storage
      .from('listing-photos')
      .upload(path, TINY_WEBP, { contentType: 'image/webp' });
    if (error) throw error;
  }
  const { data: listingId, error: listingError } = await target.client.rpc(
    'create_listing',
    { card_variant_id: holofoil?.id ?? 0, condition: 'NM', photos: [photo] },
  );
  if (listingError) throw listingError;
  const proposed = await reporter.client.rpc('create_trade', {
    recipient_id: target.id,
    listing_ids: [listingId],
    offered_cash_cents: 500,
  });
  if (proposed.error) throw proposed.error;
  const reported = await reporter.client.rpc('report_trader', {
    trader_id: target.id,
    reason: 'Asked me to pay first over Venmo.',
  });
  if (reported.error) throw reported.error;

  // The Founder bans the target from the report.
  await founderPage.goto('/admin/reports');
  const report = founderPage.getByRole('article', {
    name: `Report about ${targetName}`,
  });
  await report.getByRole('button', { name: `Ban ${targetName}` }).click();
  const sheet = founderPage.getByRole('dialog', { name: `Ban ${targetName}?` });
  await expect(sheet).toContainText('There is no way to lift a ban');
  expect(
    await founderPage.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBe(0);
  await sheet.getByRole('button', { name: 'Ban', exact: true }).click();
  await expect(report.getByText('Banned', { exact: true })).toBeVisible({
    timeout: coldStartWait,
  });

  // The reporter's Trade with them shows the ban on their Reputation.
  await page.goto('/trades');
  await expect(
    page.getByRole('button', { name: new RegExp(`Trade with ${targetName}`) }),
  ).toContainText('Banned · 0 Trades');

  // And the target's session is refused.
  const { error } = await target.client.from('cities').select('id');
  expect(error?.message).toBe('this account has been banned');
});
