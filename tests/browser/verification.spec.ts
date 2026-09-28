import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { cameraPhoto } from './photo-fixture.ts';
import {
  arrangeCity,
  emptyReviewQueue,
  makeFounder,
  signInAsNewTrader,
  verificationDocumentCount,
  verifyTrader,
} from './session.ts';

/*
 * Verification, end to end at 375px: a Trader who is not verified goes to
 * propose a Trade and is sent to verification instead, photographs their ID
 * and themselves, a Founder approves them from the review queue, and the
 * Trader sends the proposal they came for.
 *
 * Wiring only. Who may read a document, that none outlives its review, and
 * every refusal along the way are proven at seam 1
 * (tests/db/verification.test.ts).
 *
 * The Match is arranged through the API, as trades.spec.ts arranges it, and
 * the Founder through a superuser connection: nothing a client can call
 * makes one.
 */

const CARD_IMAGE = readFileSync(
  new URL('./fixtures/card-image.svg', import.meta.url),
);

/** A real 1x1 WebP, the smallest thing the photo bucket accepts. */
const TINY_WEBP = Buffer.from(
  'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
  'base64',
);

/** What a phone's camera hands over: an ID lying flat, and a face upright. */
const ID_PHOTO = cameraPhoto(2000, 1500);
const SELFIE = cameraPhoto(1500, 2000);

/** Card images are hotlinked from TCGplayer; faked at the network edge. */
async function fakeCardImages(page: Page) {
  await page.route('https://tcgplayer-cdn.tcgplayer.com/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: CARD_IMAGE }),
  );
}

/** Nothing on the page is wider than the 375px it is drawn at. */
async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBe(0);
}

test('a Trader who is not verified is sent to verification, and proposes once a Founder approves', async ({
  browser,
}) => {
  const traderPage = await (await browser.newContext()).newPage();
  const founderPage = await (await browser.newContext()).newPage();
  await fakeCardImages(traderPage);

  await emptyReviewQueue();
  const city = await arrangeCity();
  const listerName = 'Lister';
  const traderName = `Asker ${randomUUID().slice(0, 8)}`;
  // The lister needs no browser of their own; theirs is a page only so the
  // session helper has somewhere to sign them in.
  const lister = await signInAsNewTrader(
    await (await browser.newContext()).newPage(),
    city,
    listerName,
  );
  const trader = await signInAsNewTrader(traderPage, city, traderName);
  const founder = await signInAsNewTrader(founderPage, city, 'Founder');
  await verifyTrader(lister.id);
  await makeFounder(founder.id);

  // The Match: the lister's Near Mint Holofoil Examplemon, which the Trader
  // wants.
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
  const { error: listingError } = await lister.client.rpc('create_listing', {
    card_variant_id: holofoil?.id ?? 0,
    condition: 'NM',
    photos: [photo],
  });
  if (listingError) throw listingError;
  const { error: wantError } = await trader.client.rpc('add_want', {
    card_id: card.id,
  });
  if (wantError) throw wantError;

  // The Trader goes to propose, and is sent to verification instead.
  await traderPage.goto('/');
  await traderPage
    .getByRole('button', { name: new RegExp(`Listed by ${listerName}`) })
    .click();
  await traderPage.getByRole('button', { name: 'Propose a trade' }).click();
  await expect(
    traderPage.getByRole('heading', { name: 'Propose a trade' }),
  ).toBeVisible();
  const proposeUrl = traderPage.url();
  await expect(
    traderPage.getByRole('button', { name: 'Send proposal' }),
  ).toHaveCount(0);
  await traderPage.getByRole('button', { name: 'Get verified' }).click();

  await expect(traderPage).toHaveURL(/\/verification$/);
  await expect(
    traderPage.getByRole('heading', { name: 'Get verified' }),
  ).toBeVisible();
  const send = traderPage.getByRole('button', { name: 'Send for review' });
  // Nothing is sent without both photos.
  await expect(send).toBeDisabled();
  await traderPage.getByLabel('Take a photo of your ID').setInputFiles({
    name: 'id.bmp',
    mimeType: 'image/bmp',
    buffer: ID_PHOTO,
  });
  await expect(send).toBeDisabled();
  await traderPage.getByLabel('Take a selfie').setInputFiles({
    name: 'selfie.bmp',
    mimeType: 'image/bmp',
    buffer: SELFIE,
  });
  await expect(
    traderPage.getByRole('img', { name: 'Your ID photo' }),
  ).toBeVisible();
  await expect(
    traderPage.getByRole('img', { name: 'Your selfie' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(traderPage);
  await send.click();

  await expect(
    traderPage.getByText('In review', { exact: true }),
  ).toBeVisible();
  await expect(send).toHaveCount(0);
  expect(await verificationDocumentCount(trader.id)).toBe(2);

  // A Trader who is not a Founder has no review queue to open.
  await traderPage.goto('/admin/verification');
  await expect(traderPage).toHaveURL(/\/$/);

  // The Founder finds the request in the queue, and looks at both photos.
  await founderPage.goto('/admin/verification');
  await expect(
    founderPage.getByRole('heading', { name: 'Verification requests' }),
  ).toBeVisible();
  await founderPage
    .getByRole('button', { name: new RegExp(traderName) })
    .click();
  await expect(founderPage).toHaveURL(/\/admin\/verification\/[0-9a-f-]{36}$/);
  const idPhoto = founderPage.getByRole('img', {
    name: `ID photo from ${traderName}`,
  });
  const selfie = founderPage.getByRole('img', {
    name: `Selfie from ${traderName}`,
  });
  await expect(idPhoto).toBeVisible();
  await expect(selfie).toBeVisible();
  // What was stored is what the upload pipeline makes of a camera's photo.
  await expect(idPhoto).toHaveJSProperty('naturalWidth', 1600);
  await expect(idPhoto).toHaveJSProperty('naturalHeight', 1200);
  await expect(selfie).toHaveJSProperty('naturalHeight', 1600);
  await expectNoHorizontalOverflow(founderPage);

  await founderPage.getByRole('button', { name: 'Approve' }).click();
  const sheet = founderPage.getByRole('dialog', {
    name: `Approve ${traderName}?`,
  });
  await sheet.getByRole('button', { name: 'Approve' }).click();

  // Back at the queue, which no longer holds the request, and Storage no
  // longer holds the photos.
  await expect(founderPage).toHaveURL(/\/admin\/verification$/);
  await expect(founderPage.getByText('No requests waiting')).toBeVisible();
  expect(await verificationDocumentCount(trader.id)).toBe(0);

  // The Trader, told the result, opens it, and goes back to what they came
  // to do.
  await traderPage.goto('/verification');
  await expect(traderPage.getByText('You are verified')).toBeVisible();
  await traderPage.goto(proposeUrl);
  await expect(
    traderPage.getByRole('button', { name: 'Get verified' }),
  ).toHaveCount(0);
  const cash = traderPage.getByRole('radiogroup', { name: 'Cash' });
  await cash.getByText('From you').click();
  await traderPage.getByLabel('Cash amount').fill('10');
  await traderPage.getByRole('button', { name: 'Send proposal' }).click();

  await expect(traderPage).toHaveURL(/\/trades\/[0-9a-f-]{36}$/);
  await expect(
    traderPage.getByText(`Waiting on ${listerName} to answer.`),
  ).toBeVisible();
});
