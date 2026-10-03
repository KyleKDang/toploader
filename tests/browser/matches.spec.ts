import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { MATCHES_PAGE_SIZE } from '../../src/lib/matches-page.ts';
import { arrangeCity, signInAsNewTrader } from './session.ts';

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
 *
 * Both Traders are in a City of this run's own. Every other tracer and every
 * earlier run lists and wants Examplemon too, and in their City this Want
 * would pair with all of them, so both what it takes to add and what the
 * Matches view shows would grow with the stack (#72).
 */

const CARD_IMAGE = readFileSync(
  new URL('./fixtures/card-image.svg', import.meta.url),
);

/** A real 1x1 WebP, the smallest thing the photo bucket accepts. */
const TINY_WEBP = Buffer.from(
  'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
  'base64',
);

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

  const city = await arrangeCity();
  const listerName = 'Lister';
  const wanterName = 'Wanter';
  const lister = await signInAsNewTrader(listerPage, city, listerName);
  await signInAsNewTrader(wanterPage, city, wanterName);

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
    wanterPage.locator('header p', { hasText: `${city} · You` }),
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

  // And the row opens the Listing it is about, naming the Trader on the
  // other side of the Match so its page can propose a Trade to them.
  await yours.click();
  await expect(listerPage).toHaveURL(
    new RegExp(`/listings/${listingId}\\?with=[0-9a-f-]{36}$`),
  );
  await expect(listerPage.getByText('Your listing.')).toBeVisible();
});

/*
 * The Matches view a page at a time (#76): the first page, "Load more" under
 * it while older Matches exist, and the next page added below. How a page
 * is cut - its size, its order, what a Match arriving mid-read does - is
 * proven at seam 1 (tests/db/matches-page.test.ts).
 */
test('older Matches are behind "Load more", which goes away once they are all shown', async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  const listerPage = await (await browser.newContext()).newPage();
  await fakeCardImages(page);

  const city = await arrangeCity();
  const lister = await signInAsNewTrader(listerPage, city, 'Lister');
  const wanter = await signInAsNewTrader(page, city, 'Wanter');

  // One Match more than a page holds, arranged through the API: Listings of
  // Examplemon, and one Want that every one of them satisfies.
  const { data: card, error: cardError } = await lister.client
    .from('cards')
    .select('id, card_variants (id, name)')
    .eq('name', 'Examplemon')
    .single();
  if (cardError) throw cardError;
  const holofoil = card.card_variants.find((v) => v.name === 'Holofoil');
  await Promise.all(
    Array.from({ length: MATCHES_PAGE_SIZE + 1 }, async () => {
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
      const { error } = await lister.client.rpc('create_listing', {
        card_variant_id: holofoil?.id ?? 0,
        condition: 'NM',
        photos: [photo],
      });
      if (error) throw error;
    }),
  );
  const { error: wantError } = await wanter.client.rpc('add_want', {
    card_id: card.id,
  });
  if (wantError) throw wantError;

  await page.goto('/');
  const rows = page.getByRole('list', { name: 'Your matches' }).locator('li');
  const loadMore = page.getByRole('button', { name: 'Load more' });
  await expect(rows).toHaveCount(MATCHES_PAGE_SIZE);
  await expectNoHorizontalOverflow(page);

  await loadMore.click();

  await expect(rows).toHaveCount(MATCHES_PAGE_SIZE + 1);
  await expect(loadMore).toBeHidden();
});
