import { queryOptions } from '@tanstack/react-query';
import type { Condition } from './conditions';
import { PHOTO_MIME, type PreparedPhoto } from './photos';
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
    .select(
      'id, condition, quantity, card_variants (id, name, market_price_cents, cards (id, name, number, image_url, card_sets (name)))',
    )
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
    queryFn: () => fetchCardCollection(variantIds),
  });
}

async function fetchCardCollection(variantIds: readonly number[]) {
  const { data, error } = await supabase
    .from('collection_entries')
    .select('id, condition, quantity, card_variant_id')
    .in('card_variant_id', variantIds)
    .order('created_at');
  if (error) throw error;
  return data;
}

/** A Copy a Trader owns of one Card, as its card page lists it. */
export type CardCollectionEntry = Awaited<
  ReturnType<typeof fetchCardCollection>
>[number];

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

/**
 * The signed-in Trader's Wants, newest first, each with its Card and the
 * Variant it is narrowed to. The select policy already limits a Trader to
 * their own rows; the Trader is named here so the cache is keyed on what the
 * rows depend on, the way the Safe Spots read is.
 */
export function wantsQuery(traderId: string) {
  return queryOptions({
    queryKey: ['wants', traderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wants')
        .select(
          'id, min_condition, card:cards (id, name, number, image_url, card_sets (name)), card_variant:card_variants (id, name)',
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** A Want as the Wants screen shows it. */
export type Want = Awaited<
  ReturnType<NonNullable<ReturnType<typeof wantsQuery>['queryFn']>>
>[number];

/*
 * Listings.
 *
 * RLS is what scopes these reads by City: a Trader sees their own Listings
 * and the live ones of their City, and nothing else, so no query below
 * filters by City to make that true.
 *
 * Status is the one thing a query does have to say, and only because a
 * Trader may always read their own Listings whatever state they are in -
 * which is what lets a withdrawn Listing still open on its own page. Browse
 * is the surface that must not show one, so browse is where it is said.
 */

const LISTING_PHOTOS_BUCKET = 'listing-photos';

/** The states a Listing is still on offer in, and so still browsable in. */
const LIVE_STATUSES = ['active', 'in_trade'] as const;

/**
 * How long a photo's URL works for. The bucket is private, so a photo is
 * reached through a signed URL rather than by knowing its path; an hour is
 * longer than anyone spends on a screen and short enough that a URL that
 * gets away is not a lasting one.
 */
const PHOTO_URL_TTL_SECONDS = 60 * 60;

/**
 * Signs a batch of photo paths in one request, and returns what came back by
 * path. A path that cannot be signed is simply absent: a missing photo
 * leaves an empty tile rather than failing the screen around it.
 */
async function signedPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data, error } = await supabase.storage
    .from(LISTING_PHOTOS_BUCKET)
    .createSignedUrls(paths, PHOTO_URL_TTL_SECONDS);
  if (error) throw error;
  return new Map(
    data.flatMap(({ path, signedUrl }) =>
      path && signedUrl ? [[path, signedUrl] as const] : [],
    ),
  );
}

/**
 * The Listings of one Card in the Trader's City, newest first, each with the
 * thumbnail of its first photo.
 *
 * The thumbnail, not the full-size photo: a card page can carry a dozen of
 * these, and full-size images in a feed are what actually spends the free
 * tier's egress (ADR-0006).
 */
export function cityListingsForCardQuery(cardId: number) {
  return queryOptions({
    queryKey: ['listings', 'card', cardId],
    queryFn: () => fetchCityListingsForCard(cardId),
  });
}

async function fetchCityListingsForCard(cardId: number) {
  const { data, error } = await supabase
    .from('listings')
    .select(
      'id, condition, asking_price_cents, open_to_cash_offers, status, created_at, trader:traders(id, display_name), card_variants!inner(name, card_id), listing_photos(position, thumbnail_path)',
    )
    .eq('card_variants.card_id', cardId)
    // Without this a Trader's own withdrawn or traded Listing would still
    // sit in their area's list, because RLS lets them read their own.
    .in('status', LIVE_STATUSES)
    .order('created_at', { ascending: false })
    .order('position', { referencedTable: 'listing_photos' });
  if (error) throw error;

  const urls = await signedPhotoUrls(
    data.flatMap((listing) => firstThumbnail(listing) ?? []),
  );
  return data.map((listing) => ({
    ...listing,
    thumbnailUrl: urls.get(firstThumbnail(listing) ?? '') ?? null,
  }));
}

function firstThumbnail(listing: {
  listing_photos: { thumbnail_path: string }[];
}) {
  return listing.listing_photos[0]?.thumbnail_path;
}

/** A Listing as City browse shows it in a row. */
export type BrowsedListing = Awaited<
  ReturnType<typeof fetchCityListingsForCard>
>[number];

/**
 * One Listing as its own page shows it: the Card it is of, the Trader who
 * listed it, and every photo full size, uncropped, in the order they were
 * taken. Null when the Trader may not see it, which reads the same as one
 * that does not exist.
 */
export function listingQuery(listingId: string) {
  return queryOptions({
    queryKey: ['listing', listingId],
    queryFn: () => fetchListing(listingId),
  });
}

async function fetchListing(listingId: string) {
  const { data, error } = await supabase
    .from('listings')
    .select(
      'id, trader_id, condition, asking_price_cents, open_to_cash_offers, status, created_at, trader:traders(display_name), card_variants(name, cards(id, name, number, card_sets(name))), listing_photos(position, path)',
    )
    .eq('id', listingId)
    .order('position', { referencedTable: 'listing_photos' })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const urls = await signedPhotoUrls(
    data.listing_photos.map(({ path }) => path),
  );
  return {
    ...data,
    photoUrls: data.listing_photos.flatMap(({ path }) => urls.get(path) ?? []),
  };
}

/** A Listing as its own page shows it. */
export type ListingDetail = NonNullable<
  Awaited<ReturnType<typeof fetchListing>>
>;

/**
 * Publishes a Listing: the photos go into the bucket under the Trader's own
 * prefix first, then the RPC records the Listing that names them.
 *
 * That order is why an abandoned upload is possible at all, and why the
 * reaper sweeps uploads that never became a Listing. The other order is not
 * available: the bucket is where a photo lives, and a Listing with no photo
 * of the actual Copy is not a Listing.
 */
export async function createListing({
  traderId,
  cardVariantId,
  condition,
  photos,
  askingPriceCents,
  openToCashOffers,
}: {
  traderId: string;
  cardVariantId: number;
  condition: Condition;
  photos: PreparedPhoto[];
  askingPriceCents: number | null;
  openToCashOffers: boolean;
}): Promise<string> {
  const uploaded: { path: string; thumbnail_path: string }[] = [];
  for (const photo of photos) {
    const name = `${traderId}/${crypto.randomUUID()}`;
    const paths = {
      path: `${name}.webp`,
      thumbnail_path: `${name}-thumb.webp`,
    };
    await uploadPhoto(paths.path, photo.full);
    await uploadPhoto(paths.thumbnail_path, photo.thumbnail);
    uploaded.push(paths);
  }

  const { data, error } = await supabase.rpc('create_listing', {
    card_variant_id: cardVariantId,
    condition,
    photos: uploaded,
    asking_price_cents: askingPriceCents ?? undefined,
    open_to_cash_offers: openToCashOffers,
  });
  if (error) throw error;
  return data;
}

async function uploadPhoto(path: string, body: Blob) {
  const { error } = await supabase.storage
    .from(LISTING_PHOTOS_BUCKET)
    .upload(path, body, { contentType: PHOTO_MIME });
  if (error) throw error;
}

/** Takes a Listing down. Only its own Trader may, and only while it is active. */
export async function withdrawListing(listingId: string): Promise<void> {
  const { error } = await supabase.rpc('withdraw_listing', {
    listing_id: listingId,
  });
  if (error) throw error;
}
