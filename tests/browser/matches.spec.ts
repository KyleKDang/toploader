import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { signInAsNewTrader } from './session.ts';

/*
 * Matching, end to end at 375px: one Trader lists a Copy, another Trader
 * wants that Card, and both of them see the Match in the Matches view, each
 * from their own side and with the other Trader's Reputation on the row.
 *
 * Wiring only. What satisfies a Want, which Listings and Cities match, and
 * who may read a Match are proven at seam 1 (tests/db/matches.test.ts).
 *
 * The Want goes in through the real Wants screen, reached from the card
 * page, because this tracer is also the browser coverage #18 left to it.
 * The Listing is arranged through the API: the Listing flow has a tracer of
 * its own (listings.spec.ts), and nothing here depends on its photo.
 */

const CARD_IMAGE = readFileSync(
  new URL('./fixtures/card-image.svg', import.meta.url),
);

/** A real 1x1 WebP, the smallest thing the photo bucket accepts. */
const TINY_WEBP = Buffer.from(
  'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
  'base64',
);

/**
 * A display name no other Trader has. The City is full of other tracers'
 * and earlier runs' Listings and Wants for the same Card, so a Match can
 * only be pointed at by the name of the Trader on the other side of it.
 */
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

test('a Listing satisfies a Want, and both Traders see the Match', async ({
  browser,
}) => {
  const listerPage = await (await browser.newContext()).newPage();
  const wanterPage = await (await browser.newContext()).newPage();
  await fakeCardImages(listerPage);
  await fakeCardImages(wanterPage);

  const listerName = uniqueTrader('Lister');
  const wanterName = uniqueTrader('Wanter');
  const lister = await signInAsNewTrader(
    listerPage,
    'Orange County',
    listerName,
  );
  await signInAsNewTrader(wanterPage, 'Orange County', wanterName);

  // The Listing: a Near Mint Holofoil Examplemon, in the lister's City.
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

  // The Want, through the screens: the Card from search, then its page's
  // "Add to wants", narrowed to Holofoil and at least Lightly Played, which
  // the Near Mint Holofoil Listing satisfies.
  await wanterPage.goto('/search');
  await wanterPage
    .getByRole('combobox', { name: 'Search the catalog' })
    .fill('exam');
  await wanterPage
    .getByRole('listbox', { name: 'Cards' })
    .getByRole('option', { name: /^Examplemon\b/ })
    .first()
    .click();
  await expect(wanterPage).toHaveURL(new RegExp(`/cards/${card.id}$`));

  // The card page's button pair has about 4px to spare at 375px, and a
  // Button does not truncate, so a label that outgrows it would push the
  // layout rather than ellipsize.
  const pair = [
    wanterPage.getByRole('button', { name: 'List this card' }),
    wanterPage.getByRole('button', { name: 'Add to wants' }),
  ];
  for (const button of pair) {
    await expect(button).toBeVisible();
    expect(await button.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(
      0,
    );
  }
  await expectNoHorizontalOverflow(wanterPage);
  await pair[1]?.click();

  const addWant = wanterPage.getByRole('region', {
    name: 'Add Examplemon to wants',
  });
  await addWant
    .getByRole('radiogroup', { name: 'Variant' })
    .getByText('Holofoil', { exact: true })
    .click();
  await addWant
    .getByRole('radiogroup', { name: 'Minimum Condition' })
    .getByText('Lightly Played')
    .click();
  await addWant.getByRole('button', { name: 'Add to wants' }).click();
  await expect(addWant).toBeHidden();

  // The wanting Trader's side: the lister's Listing, which they want.
  await wanterPage.goto('/');
  await expect(
    wanterPage.getByRole('heading', { name: 'Matches' }),
  ).toBeVisible();
  const theirs = wanterPage.getByRole('button', {
    name: new RegExp(`Listed by ${listerName}`),
  });
  await expect(theirs).toContainText('Examplemon');
  await expect(theirs).toContainText(
    'Holofoil · NM · Example Base Set 004/102',
  );
  await expect(theirs).toContainText(`Listed by ${listerName}`);
  await expect(theirs).toContainText('Not verified · 0 Trades');
  // The thumbnail is what a Match row serves, never the full-size photo.
  await expect(theirs.locator('img')).toHaveAttribute(
    'src',
    new RegExp(photo.thumbnail_path),
  );
  // The Trader's own Reputation, once, in the header.
  await expect(
    wanterPage.locator('header p', { hasText: 'Orange County · You' }),
  ).toContainText('Not verified · 0 Trades');
  await expectNoHorizontalOverflow(wanterPage);

  // The lister's side: the same Match, as someone wanting their Listing.
  await listerPage.goto('/');
  const yours = listerPage.getByRole('button', {
    name: new RegExp(`Wanted by ${wanterName}`),
  });
  await expect(yours).toContainText('Examplemon');
  await expect(yours).toContainText('Not verified · 0 Trades');
  await expectNoHorizontalOverflow(listerPage);

  // And the row opens the Listing it is about.
  await yours.click();
  await expect(listerPage).toHaveURL(new RegExp(`/listings/${listingId}$`));
  await expect(listerPage.getByText('Your listing.')).toBeVisible();
});
