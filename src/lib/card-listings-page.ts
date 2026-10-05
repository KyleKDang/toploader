import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';

/*
 * A card page's Listings, read a page at a time (#109): the newest of the
 * City's live Listings of the Card first, and "Load more" for the next page
 * for as long as there are older ones. Without the page a popular Card's
 * screen signed and downloaded a thumbnail for every Listing in the City,
 * and past PostgREST's row cap dropped the rest without saying so.
 *
 * The client is a parameter rather than the app's own, so the seam-1 suite
 * calls this very read as a seeded Trader
 * (tests/db/card-listings-page.test.ts) and what it proves is what the
 * screen does.
 *
 * RLS is what keeps the read to the Trader's City (src/lib/queries.ts says
 * why); the status filter is the read's own.
 */

/** How many Listings one page holds. */
export const CARD_LISTINGS_PAGE_SIZE = 30;

/** The states a Listing is still on offer in, and so still browsable in. */
const LIVE_STATUSES = ['active', 'in_trade'] as const;

/**
 * Where a page ends: the last Listing on it, named by everything the order
 * runs on. The next page is the Listings that come after it.
 */
export type CardListingsCursor = {
  createdAt: string;
  id: string;
};

/**
 * One page of the City's live Listings of a Card, newest first, each with
 * its Trader, its Variant, and its photos' thumbnail paths in the order
 * they were taken. `next` is the cursor to read the following page with, or
 * null when this page is the last.
 *
 * The page is found by keyset, as the Matches page is
 * (src/lib/matches-page.ts): the Listings after the cursor rather than a
 * count of rows to skip, so a Listing published while the Trader reads
 * shifts nothing they have yet to see. The order is the listed time, newest
 * first, then the Listing's id, so no two Listings tie.
 *
 * One Listing more than a page is asked for and not returned: whether it
 * came back is whether there is a further page.
 */
export async function readCardListingsPage(
  client: SupabaseClient<Database>,
  cardId: number,
  after: CardListingsCursor | null,
) {
  let query = client
    .from('listings')
    .select(
      'id, condition, asking_price_cents, open_to_cash_offers, status, created_at, trader:traders(id, display_name), card_variants!inner(name, card_id), listing_photos(position, thumbnail_path)',
    )
    .eq('card_variants.card_id', cardId)
    // Without this a Trader's own withdrawn or traded Listing would still
    // sit in their area's list, because RLS lets them read their own.
    .in('status', LIVE_STATUSES)
    .order('created_at', { ascending: false })
    .order('id')
    .order('position', { referencedTable: 'listing_photos' })
    .limit(CARD_LISTINGS_PAGE_SIZE + 1);
  if (after) {
    // Quoted for the reason readMatchesPage gives: the time's "+" and colons.
    const at = `"${after.createdAt}"`;
    query = query.or(
      `created_at.lt.${at},and(created_at.eq.${at},id.gt.${after.id})`,
    );
  }
  const { data, error } = await query;
  if (error) throw error;

  const listings = data.slice(0, CARD_LISTINGS_PAGE_SIZE);
  const last = listings.at(-1);
  const next: CardListingsCursor | null =
    data.length > CARD_LISTINGS_PAGE_SIZE && last
      ? { createdAt: last.created_at, id: last.id }
      : null;
  return { listings, next };
}

/** A page of a Card's Listings, and the cursor to the one after it. */
export type CardListingsPage = Awaited<ReturnType<typeof readCardListingsPage>>;
