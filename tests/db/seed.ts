import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { inject } from 'vitest';
import type { Condition } from '../../src/lib/conditions.ts';
import type { Database } from '../../src/lib/database.types.ts';

export type Client = SupabaseClient<Database>;

export interface SeededTrader {
  id: string;
  email: string;
  displayName: string;
  client: Client;
}

export const ORANGE_COUNTY = 'Orange County';

/**
 * A second City that exists only on local and CI stacks, seeded by
 * supabase/seed.sql, so a test can put a Trader somewhere other than the
 * launch City.
 */
export const TEST_CITY = 'Test City';

/** A client with no session: the anon role, as a signed-out visitor. */
export function anonClient(): Client {
  return createClient<Database>(
    inject('supabaseUrl'),
    inject('supabasePublishableKey'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * A client holding the server-side key: service_role, the identity of the
 * Catalog sync and of no Trader.
 */
export function serviceClient(): Client {
  return createClient<Database>(
    inject('supabaseUrl'),
    inject('supabaseSecretKey'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * A new Trader who signed up with email through real Auth and whose client
 * holds their session. The profile is left exactly as signup leaves it.
 */
export async function signUpTrader(): Promise<
  Omit<SeededTrader, 'displayName'>
> {
  const client = anonClient();
  const email = `trader-${randomUUID()}@example.test`;
  const { data, error } = await client.auth.signUp({
    email,
    password: randomUUID(),
  });
  if (error) throw error;
  if (!data.user || !data.session) {
    throw new Error('Signup returned no session; are email confirmations on?');
  }
  return { id: data.user.id, email, client };
}

export async function cityId(client: Client, name: string): Promise<string> {
  const { data, error } = await client
    .from('cities')
    .select('id')
    .eq('name', name)
    .single();
  if (error) throw error;
  return data.id;
}

/** A Trader who has finished onboarding, in Orange County unless told. */
export async function seedTrader(
  displayName: string,
  city: string = ORANGE_COUNTY,
): Promise<SeededTrader> {
  const trader = await signUpTrader();
  const { error } = await trader.client.rpc('set_trader_profile', {
    display_name: displayName,
    city_id: await cityId(trader.client, city),
    attests_adult: true,
  });
  if (error) throw error;
  return { ...trader, displayName };
}

/**
 * The default shape of a seam-1 test: the Trader acting, the counterparty
 * they deal with, and a foreign Trader who is party to nothing and must be
 * denied. Every call seeds fresh Traders, so test files never share state.
 */
export async function seedAdversarialTraders(): Promise<{
  actor: SeededTrader;
  counterparty: SeededTrader;
  foreign: SeededTrader;
}> {
  const [actor, counterparty, foreign] = await Promise.all([
    seedTrader('Actor'),
    seedTrader('Counterparty'),
    seedTrader('Foreign'),
  ]);
  return { actor, counterparty, foreign };
}

/** The bucket a Listing's photos live in. */
export const LISTING_PHOTOS_BUCKET = 'listing-photos';

/**
 * A real 1x1 WebP, 44 bytes: the smallest thing the bucket accepts, so a
 * test about who may read or write a photo does not have to carry a
 * photograph around to say so.
 */
export const TINY_WEBP = Buffer.from(
  'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
  'base64',
);

/**
 * A full-size photo and its thumbnail, uploaded under the Trader's own
 * prefix the way the browser path uploads them, ready for `create_listing`.
 */
export async function uploadListingPhoto(
  trader: SeededTrader,
): Promise<{ path: string; thumbnail_path: string }> {
  const name = randomUUID();
  const photo = {
    path: `${trader.id}/${name}.webp`,
    thumbnail_path: `${trader.id}/${name}-thumb.webp`,
  };
  for (const path of [photo.path, photo.thumbnail_path]) {
    const { error } = await trader.client.storage
      .from(LISTING_PHOTOS_BUCKET)
      .upload(path, TINY_WEBP, { contentType: 'image/webp' });
    if (error) throw error;
  }
  return photo;
}

/*
 * The pair Matching is made of, for a test whose subject is what happens
 * once a Match exists rather than whether it does. Both go through the RPCs
 * the app calls, so nothing here reaches a state the app could not.
 */

/** Cards from the made-up set supabase/seed.sql syncs. */
export const EXAMPLEMON = 990_900_001;

/** A Card's id and its Variants, read as any signed-in Trader may. */
export async function seededCard(client: Client, productId: number) {
  const { data, error } = await client
    .from('cards')
    .select('id, card_variants (id, name)')
    .eq('tcgplayer_product_id', productId)
    .single();
  if (error) throw error;
  return data;
}

export async function addWant(
  trader: SeededTrader,
  want: {
    card_id: number;
    card_variant_id?: number;
    min_condition?: Condition;
  },
): Promise<string> {
  const { data, error } = await trader.client.rpc('add_want', want);
  if (error) throw error;
  return data;
}

/** An active Listing of one Copy, with one photo uploaded for it. */
export async function createListing(
  trader: SeededTrader,
  cardVariantId: number,
  condition: Condition,
): Promise<string> {
  const { data, error } = await trader.client.rpc('create_listing', {
    card_variant_id: cardVariantId,
    condition,
    photos: [await uploadListingPhoto(trader)],
  });
  if (error) throw error;
  return data;
}
