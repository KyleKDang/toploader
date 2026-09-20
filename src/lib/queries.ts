import { queryOptions } from '@tanstack/react-query';
import { supabase } from './supabase';

/*
 * What the routes need to know about the signed-in Trader - who they are,
 * their profile, and whether it is set up - the Cities to pick from, the
 * Safe Spots of the Trader's City, and the Catalog's Cards.
 * Reads are TanStack Query options, so a route loader and a component share
 * one cache entry per read.
 */

/** The signed-in Trader's id, or null when nobody is signed in. */
export async function currentTraderId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user.id ?? null;
}

/** A Trader's public profile, with their City. */
export type TraderProfile = {
  display_name: string | null;
  city: { id: string; name: string } | null;
};

export function traderQuery(traderId: string) {
  return queryOptions({
    queryKey: ['trader', traderId],
    queryFn: async (): Promise<TraderProfile> => {
      const { data, error } = await supabase
        .from('traders')
        .select('display_name, city:cities(id, name)')
        .eq('id', traderId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Whether the Trader has finished onboarding. `set_trader_profile` sets the
 * display name and City together, and only with the 18-or-over attestation,
 * so a profile with both has all three.
 */
export function hasProfile(trader: TraderProfile): trader is OnboardedTrader {
  return trader.display_name !== null && trader.city !== null;
}

/** A Trader who has finished onboarding: display name and City both set. */
export type OnboardedTrader = {
  display_name: string;
  city: NonNullable<TraderProfile['city']>;
};

/** Every City, in name order. Reference data, so never refetched. */
export const citiesQuery = queryOptions({
  queryKey: ['cities'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('cities')
      .select('id, name')
      .order('name');
    if (error) throw error;
    return data;
  },
  staleTime: Infinity,
});

/**
 * The Safe Spots of the signed-in Trader's City, in name order. RLS already
 * limits a Trader to their own City's rows; the City is named here so the
 * cache is keyed on what the rows depend on, and a Trader whose City changes
 * gets a fresh read. Reference data, so never refetched.
 */
export function safeSpotsQuery(cityId: string) {
  return queryOptions({
    queryKey: ['safe-spots', cityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('safe_spots')
        .select('id, name, address, kind, notes')
        .eq('city_id', cityId)
        .order('name');
      if (error) throw error;
      return data;
    },
    staleTime: Infinity,
  });
}

/*
 * The Catalog changes once a day, when the sync runs, so a Card read in the
 * last hour is fresh enough for the picker and the card page alike.
 */
const CATALOG_STALE_MS = 60 * 60 * 1000;

/**
 * The one order a Card's Variants come in, by name. The picker names a
 * Card's first Variant and its price, and the card page opens on its first
 * Variant; sharing this is what keeps those the same Variant.
 */
const VARIANTS_BY_NAME = [
  'name',
  { referencedTable: 'card_variants' },
] as const;

/**
 * The Cards a search finds, best first, at most 20: search_cards ranks them
 * on the server, across the whole Catalog. Each carries its set and its
 * Variants in name order, the order the card page lists them in.
 */
export function cardSearchQuery(query: string) {
  return queryOptions({
    queryKey: ['card-search', query],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('search_cards', { query })
        .select(
          'id, name, number, image_url, card_sets (name), card_variants (name, market_price_cents)',
        )
        .order(...VARIANTS_BY_NAME);
      if (error) throw error;
      return data;
    },
    staleTime: CATALOG_STALE_MS,
  });
}

/**
 * One Card for its card page, with its set and its Variants in name order,
 * each with its Market Price and the day that price was last confirmed.
 * Null when no Card has that id.
 */
export function cardQuery(cardId: number) {
  return queryOptions({
    queryKey: ['card', cardId],
    queryFn: () => fetchCard(cardId),
    staleTime: CATALOG_STALE_MS,
  });
}

async function fetchCard(cardId: number) {
  const { data, error } = await supabase
    .from('cards')
    .select(
      'id, name, number, rarity, image_url, card_sets (name), card_variants (id, name, market_price_cents, market_price_as_of)',
    )
    .eq('id', cardId)
    .order(...VARIANTS_BY_NAME)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** A Card as its card page shows it. */
export type CatalogCard = NonNullable<Awaited<ReturnType<typeof fetchCard>>>;

/*
 * A Trader's Collection: the Copies they own, the Copies of one Card, and
 * what the whole Collection is worth at Market Price.
 *
 * RLS already limits every one of these reads to the caller's own rows. The
 * Trader is named in the key anyway, so the cache is keyed on whose rows
 * these are - the same reason safeSpotsQuery names the City.
 */

/** Everything cached about one Trader's Collection, for invalidating it. */
export function collectionKey(traderId: string) {
  return ['collection', traderId] as const;
}

/** A Copy a Trader owns, with the Card and the Market Price it is valued at. */
const ENTRY_COLUMNS =
  'id, condition, quantity, card_variants (id, name, market_price_cents, cards (id, name, number, image_url, card_sets (name)))';

/** The Copies a Trader owns, most recently added first. */
export function collectionQuery(traderId: string) {
  return queryOptions({
    queryKey: collectionKey(traderId),
    queryFn: () => fetchCollection(),
  });
}

async function fetchCollection() {
  const { data, error } = await supabase
    .from('collection_entries')
    .select(ENTRY_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** One Copy a Trader owns, as the Collection screen draws it. */
export type CollectionEntry = Awaited<
  ReturnType<typeof fetchCollection>
>[number];

/**
 * The Copies a Trader owns of one Card, which is what its card page shows
 * and edits. It names the Card's Variants rather than the Card, because that
 * is the column an entry carries, and the page already holds them.
 */
export function cardCollectionQuery(
  traderId: string,
  cardId: number,
  variantIds: readonly number[],
) {
  return queryOptions({
    queryKey: [...collectionKey(traderId), 'card', cardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collection_entries')
        .select('id, condition, quantity, card_variant_id')
        .in('card_variant_id', variantIds)
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

/**
 * The single total-value line a Collection shows: what its Copies are worth
 * at Market Price, how many Copies that is, and how many of them the Catalog
 * has no price for, so the line can say so rather than valuing them at
 * nothing. Null until the Trader owns a Copy.
 */
export function collectionValueQuery(traderId: string) {
  return queryOptions({
    queryKey: [...collectionKey(traderId), 'value'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collection_value')
        .select('copy_count, total_cents, unpriced_copy_count')
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      // Each column is an aggregate over a group that exists, so none of
      // them is ever null. Postgres cannot promise that about a view, and
      // the generated types say so; the promise is kept here rather than at
      // every place the line is drawn.
      return {
        copy_count: data.copy_count ?? 0,
        total_cents: data.total_cents ?? 0,
        unpriced_copy_count: data.unpriced_copy_count ?? 0,
      };
    },
  });
}
