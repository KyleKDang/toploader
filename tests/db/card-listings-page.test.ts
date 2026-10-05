import { describe, expect, it } from 'vitest';
import {
  CARD_LISTINGS_PAGE_SIZE,
  readCardListingsPage,
  type CardListingsPage,
} from '../../src/lib/card-listings-page.ts';
import { arrange, arrangeCity } from './arrange.ts';
import {
  createListing,
  seededExamplemon,
  seedTrader,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * A card page's Listings are read a page at a time (#109): the newest
 * first, and each later page found by what comes after the last Listing
 * shown rather than by counting rows to skip - the way the Matches page is
 * (tests/db/matches-page.test.ts).
 *
 * The read under test is the one the card page makes, called here as a
 * seeded Trader. Which Listings a Trader may see at all is proven in
 * listings.test.ts; this file is about how a Card's Listings are cut into
 * pages.
 *
 * Every test counts a whole City's Listings of the Card, so each one puts
 * its Traders in a City of their own, where the only Listings are the ones
 * it arranged.
 */

/** More than one page, with a short last page. */
const OVER_A_PAGE = CARD_LISTINGS_PAGE_SIZE + 5;

/*
 * Each test arranges more than a page of Listings through the real RPC, one
 * at a time, which takes longer than the default five seconds on a busy
 * stack.
 */
describe('A card page’s Listings', { timeout: 60_000 }, () => {
  /** A Trader who lists, a Trader who browses, and a foreign Trader. */
  async function seedCity() {
    const city = await arrangeCity();
    const [lister, browser, foreign] = await Promise.all([
      seedTrader('Lister', city),
      seedTrader('Browser', city),
      seedTrader('Foreign', await arrangeCity()),
    ]);
    const { card, holofoil } = await seededExamplemon(lister.client);
    return { lister, browser, foreign, card, holofoil };
  }

  /** Listings made one after another, so each is newer than the last. */
  async function listInTurn(
    lister: SeededTrader,
    variant: number,
    count: number,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (let made = 0; made < count; made += 1) {
      ids.push(await createListing(lister, variant, 'NM'));
    }
    return ids;
  }

  it('gives at most a page, newest first, and every Listing exactly once by the end', async () => {
    const { lister, browser, card, holofoil } = await seedCity();
    const oldestFirst = await listInTurn(lister, holofoil, OVER_A_PAGE);
    const newestFirst = oldestFirst.toReversed();

    const first = await readCardListingsPage(browser.client, card, null);

    expect(listingIds([first])).toEqual(
      newestFirst.slice(0, CARD_LISTINGS_PAGE_SIZE),
    );
    expect(first.next).not.toBeNull();

    const pages = await readEveryPage(browser.client, card);
    expect(pages.map((page) => page.listings.length)).toEqual([
      CARD_LISTINGS_PAGE_SIZE,
      OVER_A_PAGE - CARD_LISTINGS_PAGE_SIZE,
    ]);
    expect(listingIds(pages)).toEqual(newestFirst);
  });

  it('neither repeats nor skips Listings that share one time across a page boundary', async () => {
    const { lister, browser, card, holofoil } = await seedCity();
    const listed = await listInTurn(lister, holofoil, OVER_A_PAGE);
    // No path in the app lists two Copies in one instant, so the tie is
    // arranged: every Listing given one time, leaving only the tie-break.
    await arrange(
      (sql) =>
        sql`update public.listings set created_at = now() where id = any(${listed})`,
    );

    const pages = await readEveryPage(browser.client, card);

    expect(pages.map((page) => page.listings.length)).toEqual([
      CARD_LISTINGS_PAGE_SIZE,
      OVER_A_PAGE - CARD_LISTINGS_PAGE_SIZE,
    ]);
    expect(listingIds(pages)).toEqual(listed.toSorted());
  });

  it('neither repeats nor drops a row when a Listing arrives between two page reads', async () => {
    const { lister, browser, card, holofoil } = await seedCity();
    const oldestFirst = await listInTurn(lister, holofoil, OVER_A_PAGE);
    const newestFirst = oldestFirst.toReversed();
    const first = await readCardListingsPage(browser.client, card, null);

    const arrival = await createListing(lister, holofoil, 'NM');
    const second = await readCardListingsPage(browser.client, card, first.next);

    // Counting rows to skip would open the second page on the last Listing
    // of the first, pushed down one place by the arrival.
    expect(listingIds([second])).toEqual(
      newestFirst.slice(CARD_LISTINGS_PAGE_SIZE),
    );
    expect(second.next).toBeNull();
    const again = await readCardListingsPage(browser.client, card, null);
    expect(again.listings[0]?.id).toBe(arrival);
  });

  it('pages only the live Listings, leaving a withdrawn one out', async () => {
    const { lister, card, holofoil } = await seedCity();
    const [withdrawn, ...live] = await listInTurn(
      lister,
      holofoil,
      CARD_LISTINGS_PAGE_SIZE + 1,
    );
    const { error } = await lister.client.rpc('withdraw_listing', {
      listing_id: withdrawn,
    });
    if (error) throw error;

    // Read as its own Trader, whom RLS lets read a withdrawn Listing: the
    // page is what has to leave it out, and a page left full by it would
    // promise a further page holding nothing.
    const page = await readCardListingsPage(lister.client, card, null);

    expect(listingIds([page])).toEqual(live.toReversed());
    expect(page.next).toBeNull();
  });

  it('gives a Trader in another City none of the Listings, whatever cursor they hold', async () => {
    const { lister, browser, foreign, card, holofoil } = await seedCity();
    await listInTurn(lister, holofoil, CARD_LISTINGS_PAGE_SIZE + 1);
    const first = await readCardListingsPage(browser.client, card, null);
    expect(first.next).not.toBeNull();

    for (const cursor of [null, first.next]) {
      const page = await readCardListingsPage(foreign.client, card, cursor);
      expect(page).toEqual({ listings: [], next: null });
    }
  });

  it.each([
    ['a few Listings', 3],
    ['exactly a page of Listings', CARD_LISTINGS_PAGE_SIZE],
  ])('gives %s in one read, with no further page', async (_, count) => {
    const { lister, browser, card, holofoil } = await seedCity();
    const oldestFirst = await listInTurn(lister, holofoil, count);

    const page = await readCardListingsPage(browser.client, card, null);

    expect(listingIds([page])).toEqual(oldestFirst.toReversed());
    expect(page.next).toBeNull();
  });
});

/** Follows the cursor from the top until there is no further page. */
async function readEveryPage(
  client: Client,
  card: number,
): Promise<CardListingsPage[]> {
  const pages: CardListingsPage[] = [];
  let page = await readCardListingsPage(client, card, null);
  pages.push(page);
  while (page.next) {
    page = await readCardListingsPage(client, card, page.next);
    pages.push(page);
  }
  return pages;
}

/** The Listings on some pages, in the order they were read. */
function listingIds(pages: CardListingsPage[]): string[] {
  return pages.flatMap((page) => page.listings.map((listing) => listing.id));
}
