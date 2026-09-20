import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { cameraPhoto } from './photo-fixture.ts';
import { signInAsNewTrader } from './session.ts';

/*
 * Creating a Listing, end to end at 375px: a Trader finds the Card, opens
 * it, photographs the Copy, says what it is and what they want for it, and
 * the Listing is active in their City.
 *
 * Wiring only. Who may read a Listing, the lifecycle, and what the bucket
 * refuses are proven at seam 1 (tests/db/listings.test.ts).
 *
 * The one thing that can only be proven here is the upload pipeline: it
 * runs on a canvas in the browser, so this is the only seam where a real
 * camera-sized photo becomes the WebP that is actually stored.
 */

const CARD_IMAGE = readFileSync(
  new URL('./fixtures/card-image.svg', import.meta.url),
);

/** Far larger than the 1600px the pipeline stores, as a phone's photo is. */
const PHOTO = cameraPhoto(1800, 2400);

/**
 * A display name no other Trader has. The tracers share one stack, both with
 * each other in parallel and with whatever earlier runs left behind, and City
 * browse shows every Trader in the City - so the only way to point at "my own
 * Listing" is to be the only Trader called this.
 */
function uniqueTrader(role: string) {
  return `${role} ${randomUUID().slice(0, 8)}`;
}

/**
 * What the pipeline aims a full-size photo at. The bucket's own ceiling is
 * 512 KiB and seam 1 proves it; this is the browser path holding up its end,
 * which is the only place that can be checked.
 */
const TARGET_BYTES = 250 * 1024;

test('a Trader photographs a Copy and the Listing goes active in their City', async ({
  page,
}) => {
  await page.route('https://tcgplayer-cdn.tcgplayer.com/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: CARD_IMAGE }),
  );
  const name = uniqueTrader('Lister');
  const trader = await signInAsNewTrader(page, 'Orange County', name);
  await page.goto('/search');

  await page.getByRole('combobox', { name: 'Search the catalog' }).fill('exam');
  await page
    .getByRole('listbox', { name: 'Cards' })
    .getByRole('option', { name: /^Examplemon\b/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/cards\/\d+$/);
  const cardUrl = page.url();

  // Not "nobody is listing this": other tracers run in parallel against the
  // same stack and their Listings are legitimately in this Trader's City.
  // What must not be here yet is this Trader's own.
  const ownRow = page.getByRole('button', { name: new RegExp(name) });
  await expect(ownRow).toHaveCount(0);
  await page.getByRole('button', { name: 'List this card' }).click();

  await expect(
    page.getByRole('heading', { name: 'List a card' }),
  ).toBeVisible();
  const listIt = page.getByRole('button', { name: 'List it' });
  // Nothing can be listed without a photograph of the actual Copy.
  await expect(listIt).toBeDisabled();

  await page
    .getByLabel('Add photos of your card')
    .setInputFiles({ name: 'copy.bmp', mimeType: 'image/bmp', buffer: PHOTO });
  await expect(page.getByText('Photos of your card (1 of 5)')).toBeVisible();

  await page
    .getByRole('radiogroup', { name: 'Condition' })
    .getByText('Lightly Played')
    .click();
  await page.getByLabel('Asking price').fill('25');
  await page.getByLabel('Open to cash offers').check();
  await expect(listIt).toBeEnabled();
  await listIt.click();

  // The Listing's own page: active, the Trader's own, with the photo served.
  await expect(page).toHaveURL(/\/listings\/[0-9a-f-]{36}$/);
  const listingId = page.url().split('/').pop() ?? '';
  await expect(page.getByText('Your listing.')).toBeVisible();
  await expect(page.getByText('$25.00')).toBeVisible();
  await expect(page.getByText('Open to cash offers')).toBeVisible();
  await expect(
    page.getByText('Example Base Set · 004/102 · Holofoil · Lightly Played'),
  ).toBeVisible();

  const photo = page.getByRole('img', {
    name: 'Examplemon, Lightly Played, photo 1',
  });
  await expect(photo).toBeVisible();
  // Re-encoded to the stored size, not the 1800x2400 that was picked: the
  // long edge is 1600 and the shape is kept.
  await expect(photo).toHaveJSProperty('naturalHeight', 1600);
  await expect(photo).toHaveJSProperty('naturalWidth', 1200);

  // Back on the Card, the Listing is in City browse, on its thumbnail.
  await page.goto(cardUrl);
  await expect(ownRow).toContainText('$25.00');
  await expect(ownRow).toContainText('LP · Holofoil · Open to cash offers');
  // alt="" on purpose - the row already names the Trader and Condition -
  // which makes the thumbnail presentational, so it has no img role to ask for.
  const thumbnail = ownRow.locator('img');
  await expect(thumbnail).toHaveJSProperty('naturalHeight', 400);
  await expect(thumbnail).toHaveJSProperty('naturalWidth', 286);

  // What is actually in the bucket: WebP, and small. The bucket refuses
  // anything bigger whatever the client does (proven at seam 1); this is the
  // browser path holding up its end of that.
  // This Listing's photos, not every photo the Trader can see: their City's
  // other Listings are readable too, and earlier runs left plenty of them.
  const { data: photos, error } = await trader.client
    .from('listing_photos')
    .select('path, thumbnail_path')
    .eq('listing_id', listingId);
  if (error) throw error;
  expect(photos).toHaveLength(1);

  for (const path of [photos[0]?.path, photos[0]?.thumbnail_path]) {
    const stored = await trader.client.storage
      .from('listing-photos')
      .download(path ?? '');
    if (stored.error) throw stored.error;
    expect(stored.data.type).toBe('image/webp');
    expect(stored.data.size).toBeLessThan(TARGET_BYTES);
  }
  // The photo that went in was over 12 MB of pixels.
  expect(PHOTO.byteLength).toBeGreaterThan(12 * 1024 * 1024);
});

test('a Trader withdraws a Listing and it leaves their area', async ({
  page,
}) => {
  await page.route('https://tcgplayer-cdn.tcgplayer.com/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: CARD_IMAGE }),
  );
  const name = uniqueTrader('Withdrawer');
  await signInAsNewTrader(page, 'Orange County', name);
  await page.goto('/search');

  await page.getByRole('combobox', { name: 'Search the catalog' }).fill('exam');
  await page
    .getByRole('listbox', { name: 'Cards' })
    .getByRole('option', { name: /^Examplemon\b/ })
    .first()
    .click();
  const cardUrl = page.url();

  await page.getByRole('button', { name: 'List this card' }).click();
  await page
    .getByLabel('Add photos of your card')
    .setInputFiles({ name: 'copy.bmp', mimeType: 'image/bmp', buffer: PHOTO });
  await page.getByRole('button', { name: 'List it' }).click();
  await expect(page).toHaveURL(/\/listings\/[0-9a-f-]{36}$/);
  const listingUrl = page.url();

  await page.getByRole('button', { name: 'Withdraw this listing' }).click();
  const sheet = page.getByRole('dialog', { name: 'Withdraw this listing?' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Withdraw', exact: true }).click();

  // Still the Trader's own to look at, and plainly withdrawn.
  await expect(sheet).toBeHidden();
  await expect(page.getByText('Withdrawn', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Withdraw this listing' }),
  ).toBeHidden();
  // And it stays readable on its own page, which is why browse has to be
  // the thing that leaves it out.
  await page.goto(listingUrl);
  await expect(page.getByText('Your listing.')).toBeVisible();

  // Gone from their area, for the Trader who listed it as much as anyone.
  await page.goto(cardUrl);
  await expect(
    page.getByRole('button', { name: new RegExp(name) }),
  ).toHaveCount(0);
});
