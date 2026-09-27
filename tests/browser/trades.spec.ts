import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { signInAsNewTrader, verifyTrader } from './session.ts';

/*
 * Proposing a Trade, end to end at 375px: two Verified Traders with a Match,
 * one proposes from it, and the other finds the Trade in their Trades list,
 * opens it, and accepts.
 *
 * Wiring only. Who may propose, answer, and read a Trade, and every refusal
 * along the way, are proven at seam 1 (tests/db/trades.test.ts).
 *
 * The Listing and the Want are arranged through the API: each has a tracer
 * of its own, and this one starts where a Match already exists.
 */

const CARD_IMAGE = readFileSync(
  new URL('./fixtures/card-image.svg', import.meta.url),
);

/** A real 1x1 WebP, the smallest thing the photo bucket accepts. */
const TINY_WEBP = Buffer.from(
  'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
  'base64',
);

/** A display name no other Trader has, for the reason matches.spec.ts gives. */
function uniqueTrader(role: string) {
  return `${role} ${randomUUID().slice(0, 8)}`;
}

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

test('a Trader proposes from a Match, and the other Trader accepts', async ({
  browser,
}) => {
  const listerPage = await (await browser.newContext()).newPage();
  const proposerPage = await (await browser.newContext()).newPage();
  await fakeCardImages(listerPage);
  await fakeCardImages(proposerPage);

  const listerName = uniqueTrader('Lister');
  const proposerName = uniqueTrader('Proposer');
  const lister = await signInAsNewTrader(
    listerPage,
    'Orange County',
    listerName,
  );
  const proposer = await signInAsNewTrader(
    proposerPage,
    'Orange County',
    proposerName,
  );
  await verifyTrader(lister.id);
  await verifyTrader(proposer.id);

  // The Match: the lister's Near Mint Holofoil Examplemon, which the
  // proposer wants.
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
  const { error: wantError } = await proposer.client.rpc('add_want', {
    card_id: card.id,
  });
  if (wantError) throw wantError;

  // The proposer opens the Match, and proposes from the Listing it is about.
  await proposerPage.goto('/');
  await proposerPage
    .getByRole('button', { name: new RegExp(`Listed by ${listerName}`) })
    .click();
  await expect(proposerPage).toHaveURL(new RegExp(`/listings/${listingId}`));
  await proposerPage.getByRole('button', { name: 'Propose a trade' }).click();

  await expect(
    proposerPage.getByRole('heading', { name: 'Propose a trade' }),
  ).toBeVisible();
  // The Listing the Match is about is already on the table, on the side the
  // proposer gets.
  const youGet = proposerPage.getByRole('region', { name: 'You get' });
  await expect(
    youGet.getByRole('checkbox', { name: /Examplemon/ }),
  ).toBeChecked();

  // The proposer has no Listings to give, so they bring cash.
  const cash = proposerPage.getByRole('radiogroup', { name: 'Cash' });
  await cash.getByText('From you').click();
  await proposerPage.getByLabel('Cash amount').fill('12.50');
  await expectNoHorizontalOverflow(proposerPage);
  await proposerPage.getByRole('button', { name: 'Send proposal' }).click();

  await expect(proposerPage).toHaveURL(/\/trades\/[0-9a-f-]{36}$/);
  const tradeUrl = new URL(proposerPage.url()).pathname;
  await expect(
    proposerPage.getByText(`Waiting on ${listerName} to answer.`),
  ).toBeVisible();

  // The lister finds it from their Trades tab, without a notification.
  await listerPage.goto('/');
  await listerPage
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: 'Trades' })
    .click();
  await expect(listerPage).toHaveURL(/\/trades$/);
  await listerPage
    .getByRole('button', { name: new RegExp(`Trade with ${proposerName}`) })
    .click();
  await expect(listerPage).toHaveURL(new RegExp(`${tradeUrl}$`));

  // The terms, from the lister's side, and that the answer is theirs.
  await expect(listerPage.getByText('Waiting on your answer.')).toBeVisible();
  await expect(
    listerPage.getByRole('region', { name: 'You give' }),
  ).toContainText('Examplemon');
  await expect(
    listerPage.getByRole('region', { name: 'You get' }),
  ).toContainText('$12.50');
  await expectNoHorizontalOverflow(listerPage);

  await listerPage.getByRole('button', { name: 'Accept' }).click();
  await expect(listerPage.getByText('Accepted', { exact: true })).toBeVisible();
  await expect(listerPage.getByRole('button', { name: 'Accept' })).toHaveCount(
    0,
  );

  // And the proposer, back on the Trade, sees it accepted too.
  await proposerPage.reload();
  await expect(
    proposerPage.getByText('Accepted', { exact: true }),
  ).toBeVisible();
});
