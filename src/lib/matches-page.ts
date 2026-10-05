import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';

/*
 * The Matches page, read a page at a time (#76): the newest Matches first,
 * and "Load more" for the next page for as long as there are older ones.
 *
 * The client is a parameter rather than the app's own, so the seam-1 suite
 * calls this very read as a seeded Trader (tests/db/matches-page.test.ts)
 * and what it proves is what the screen does.
 */

/** How many Matches one page holds. */
export const MATCHES_PAGE_SIZE = 30;

/**
 * Where a page ends: the last Match on it, named by everything the order
 * runs on. The next page is the Matches that come after it.
 */
export type MatchesCursor = {
  matchedAt: string;
  listingId: string;
  wanterId: string;
};

/**
 * One page of the Trader's Matches, newest first, each with the Listing's
 * Card, its photos' thumbnail paths, and both Traders' Reputation basics.
 * `next` is the cursor to read the following page with, or null when this
 * page is the last.
 *
 * The page is found by keyset, not offset: it asks for the Matches after
 * the cursor instead of counting rows to skip, so a Match that arrives
 * while the Trader is reading shifts nothing they have yet to see. The
 * order is the matched time, newest first, then the Listing and the wanting
 * Trader - the pair a Match is keyed on - so no two Matches tie and "after"
 * always means one thing.
 *
 * One Match more than a page is asked for and not returned: whether it came
 * back is whether there is a further page, with no second request to count.
 */
export async function readMatchesPage(
  client: SupabaseClient<Database>,
  after: MatchesCursor | null,
) {
  let query = client
    .from('matches')
    .select(
      'matched_at, listing:listings!inner(id, condition, card_variants(name, market_price_cents, cards(name, number, card_sets(name))), listing_photos(position, thumbnail_path)), lister:traders!lister_id!inner(id, display_name, verified_at, banned_at, completed_trade_count), wanter:traders!wanter_id!inner(id, display_name, verified_at, banned_at, completed_trade_count)',
    )
    .order('matched_at', { ascending: false })
    .order('listing_id')
    .order('wanter_id')
    .order('position', { referencedTable: 'listings.listing_photos' })
    .limit(MATCHES_PAGE_SIZE + 1);
  if (after) {
    // The time is quoted because its offset carries a "+" and its clock
    // colons, which the filter syntax would otherwise read as its own.
    const at = `"${after.matchedAt}"`;
    query = query.or(
      [
        `matched_at.lt.${at}`,
        `and(matched_at.eq.${at},listing_id.gt.${after.listingId})`,
        `and(matched_at.eq.${at},listing_id.eq.${after.listingId},wanter_id.gt.${after.wanterId})`,
      ].join(','),
    );
  }
  const { data, error } = await query;
  if (error) throw error;

  const matches = data.slice(0, MATCHES_PAGE_SIZE);
  const last = matches.at(-1);
  const next: MatchesCursor | null =
    data.length > MATCHES_PAGE_SIZE && last?.matched_at
      ? {
          matchedAt: last.matched_at,
          listingId: last.listing.id,
          wanterId: last.wanter.id,
        }
      : null;
  return { matches, next };
}

/** A page of Matches, and the cursor to the one after it. */
export type MatchesPage = Awaited<ReturnType<typeof readMatchesPage>>;
