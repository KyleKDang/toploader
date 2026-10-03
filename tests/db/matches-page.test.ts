import { describe, expect, it } from 'vitest';
import {
  MATCHES_PAGE_SIZE,
  readMatchesPage,
  type MatchesPage,
} from '../../src/lib/matches-page.ts';
import { arrangeCity } from './arrange.ts';
import {
  addWant,
  createListing,
  seededExamplemon,
  seedTrader,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * The Matches page is read a page at a time (#76): the newest Matches first,
 * and each later page found by what comes after the last Match shown rather
 * than by counting rows to skip.
 *
 * The read under test is the one the Matches screen makes, called here as a
 * seeded Trader. Which pairs are Matches and who may read one are proven in
 * matches.test.ts; this file is about how a Trader's Matches are cut into
 * pages.
 *
 * Unlike that file, every test here counts a Trader's whole Matches view,
 * so each one puts its Traders in a City of their own, where the only
 * Matches are the ones it arranged.
 */

/** More than one page, with a short last page. */
const OVER_A_PAGE = MATCHES_PAGE_SIZE + 5;

describe('The Matches page', () => {
  /**
   * A Trader who lists, a Trader who wants, and a foreign Trader, alone
   * together in a new City.
   */
  async function seedPair() {
    const city = await arrangeCity();
    const [lister, wanter, foreign] = await Promise.all([
      seedTrader('Lister', city),
      seedTrader('Wanter', city),
      seedTrader('Foreign', city),
    ]);
    const { card, holofoil } = await seededExamplemon(lister.client);
    return { lister, wanter, foreign, card, holofoil };
  }

  /**
   * Listings made one after another, oldest first, so that when the Want
   * is already there each Match has a later time than the one before it.
   */
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

  it('gives the newest Matches first, and every Match exactly once by the end', async () => {
    const { lister, wanter, card, holofoil } = await seedPair();
    await addWant(wanter, { card_id: card });
    const oldestFirst = await listInTurn(lister, holofoil, OVER_A_PAGE);
    const newestFirst = oldestFirst.toReversed();

    const first = await readMatchesPage(wanter.client, null);

    expect(listingIds([first])).toEqual(
      newestFirst.slice(0, MATCHES_PAGE_SIZE),
    );
    expect(first.next).not.toBeNull();

    const pages = await readEveryPage(wanter.client);
    expect(pages.map((page) => page.matches.length)).toEqual([
      MATCHES_PAGE_SIZE,
      OVER_A_PAGE - MATCHES_PAGE_SIZE,
    ]);
    expect(listingIds(pages)).toEqual(newestFirst);
  });

  it('neither repeats nor skips Matches that share one time across a page boundary', async () => {
    const { lister, wanter, card, holofoil } = await seedPair();
    const listed = await Promise.all(
      Array.from({ length: OVER_A_PAGE }, () =>
        createListing(lister, holofoil, 'NM'),
      ),
    );
    // One Want pairs with every Listing at once, in one transaction, so
    // every Match carries the same time and only the tie-break orders them.
    await addWant(wanter, { card_id: card });

    const pages = await readEveryPage(wanter.client);

    const times = pages.flatMap((page) =>
      page.matches.map((match) => match.matched_at),
    );
    expect(new Set(times).size).toBe(1);
    expect(pages.map((page) => page.matches.length)).toEqual([
      MATCHES_PAGE_SIZE,
      OVER_A_PAGE - MATCHES_PAGE_SIZE,
    ]);
    expect(listingIds(pages)).toEqual(listed.toSorted());
  });

  it('neither repeats nor drops a row when a Match arrives between two page reads', async () => {
    const { lister, wanter, card, holofoil } = await seedPair();
    await addWant(wanter, { card_id: card });
    const oldestFirst = await listInTurn(lister, holofoil, OVER_A_PAGE);
    const newestFirst = oldestFirst.toReversed();
    const first = await readMatchesPage(wanter.client, null);

    const arrival = await createListing(lister, holofoil, 'NM');
    const second = await readMatchesPage(wanter.client, first.next);

    // Counting rows to skip would open the second page on the last Match of
    // the first, pushed down one place by the arrival.
    expect(listingIds([second])).toEqual(newestFirst.slice(MATCHES_PAGE_SIZE));
    expect(second.next).toBeNull();
    // The arrival is not lost: it leads the next read from the top.
    const again = await readMatchesPage(wanter.client, null);
    expect(again.matches[0]?.listing.id).toBe(arrival);
  });

  it('gives a foreign Trader none of the Matches, whatever cursor they hold', async () => {
    const { lister, wanter, foreign, card, holofoil } = await seedPair();
    await addWant(wanter, { card_id: card });
    await listInTurn(lister, holofoil, MATCHES_PAGE_SIZE + 1);
    const first = await readMatchesPage(wanter.client, null);
    expect(first.next).not.toBeNull();

    for (const cursor of [null, first.next]) {
      const page = await readMatchesPage(foreign.client, cursor);
      expect(page).toEqual({ matches: [], next: null });
    }
  });

  it.each([
    ['a few Matches', 3],
    ['exactly a page of Matches', MATCHES_PAGE_SIZE],
  ])('gives %s in one read, with no further page', async (_, count) => {
    const { lister, wanter, card, holofoil } = await seedPair();
    await addWant(wanter, { card_id: card });
    const oldestFirst = await listInTurn(lister, holofoil, count);

    const page = await readMatchesPage(wanter.client, null);

    expect(listingIds([page])).toEqual(oldestFirst.toReversed());
    expect(page.next).toBeNull();
  });

  it('gives a Trader with no Matches an empty page, with no further page', async () => {
    const { wanter } = await seedPair();

    expect(await readMatchesPage(wanter.client, null)).toEqual({
      matches: [],
      next: null,
    });
  });
});

/** Follows the cursor from the top until there is no further page. */
async function readEveryPage(client: Client): Promise<MatchesPage[]> {
  const pages: MatchesPage[] = [];
  let page = await readMatchesPage(client, null);
  pages.push(page);
  while (page.next) {
    page = await readMatchesPage(client, page.next);
    pages.push(page);
  }
  return pages;
}

/** The Listings of the Matches on some pages, in the order they were read. */
function listingIds(pages: MatchesPage[]): string[] {
  return pages.flatMap((page) => page.matches.map((match) => match.listing.id));
}
