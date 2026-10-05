import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { arrangeCity, makeFounder, signInAsNewTrader } from './session.ts';

/*
 * Reporting, end to end at 375px: a Trader reports another Trader's Listing
 * with a reason, and a Founder finds the report in the admin view and opens
 * the Listing from it.
 *
 * Wiring only. Who may report what, and that nobody but a Founder reads a
 * report, are proven at seam 1 (tests/db/reports.test.ts).
 *
 * The Listing is arranged through the API, as verification.spec.ts arranges
 * it, and the Founder through a superuser connection: nothing a client can
 * call makes one.
 */

/** A real 1x1 WebP, the smallest thing the photo bucket accepts. */
const TINY_WEBP = Buffer.from(
  'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
  'base64',
);

test('a Trader reports a Listing, and a Founder sees it in the admin view', async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  const founderPage = await (await browser.newContext()).newPage();
  // Card images are hotlinked from TCGplayer; nothing here is about them.
  for (const p of [page, founderPage]) {
    await p.route('https://tcgplayer-cdn.tcgplayer.com/**', (route) =>
      route.fulfill({ status: 404 }),
    );
  }

  const city = await arrangeCity();
  const listerName = `Lister ${randomUUID().slice(0, 8)}`;
  const lister = await signInAsNewTrader(
    await (await browser.newContext()).newPage(),
    city,
    listerName,
  );
  await signInAsNewTrader(page, city, 'Reporter');
  const founder = await signInAsNewTrader(founderPage, city, 'Founder');
  await makeFounder(founder.id);

  const { data: card, error: cardError } = await lister.client
    .from('cards')
    .select('id, card_variants (id, name)')
    .eq('name', 'Examplemon')
    .single();
  if (cardError) throw cardError;
  const holofoil = card.card_variants.find((v) => v.name === 'Holofoil');
  const photo = {
    path: `${lister.id}/${randomUUID()}.webp`,
    thumbnail_path: `${lister.id}/${randomUUID()}-thumb.webp`,
  };
  for (const path of [photo.path, photo.thumbnail_path]) {
    const { error } = await lister.client.storage
      .from('listing-photos')
      .upload(path, TINY_WEBP, { contentType: 'image/webp' });
    if (error) throw error;
  }
  const { data: listingId, error: listingError } = await lister.client.rpc(
    'create_listing',
    { card_variant_id: holofoil?.id ?? 0, condition: 'NM', photos: [photo] },
  );
  if (listingError) throw listingError;

  // The Trader reports the Listing from its page.
  const reason = 'The photos are of a different card.';
  await page.goto(`/listings/${listingId}`);
  await page.getByRole('button', { name: 'Report listing' }).click();
  await page.getByLabel('What happened?').fill(reason);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(
    page.getByText('Reported. The founders will take a look.'),
  ).toBeVisible();

  // The Founder finds it in the admin view, and opens the Listing from it.
  await founderPage.goto('/admin/reports');
  const report = founderPage.getByRole('article', {
    name: `Report about ${listerName}`,
  });
  await expect(report).toContainText(reason);
  await expect(report).toContainText('From Reporter');
  expect(
    await founderPage.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBe(0);
  await report.getByRole('button', { name: /Examplemon/ }).click();
  await expect(founderPage).toHaveURL(new RegExp(`/listings/${listingId}$`));
});
