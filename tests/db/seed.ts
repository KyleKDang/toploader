import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { inject } from 'vitest';
import type { Condition } from '../../src/lib/conditions.ts';
import type { Database } from '../../src/lib/database.types.ts';
import { arrangeCity } from './arrange.ts';

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

let ownCity: Promise<string> | undefined;

/**
 * The City this test file's Traders are seeded into unless told otherwise:
 * one arranged for the file alone, the first time the file asks.
 *
 * Matching pairs an active Listing with every Want for its Card in the
 * City, and a long-lived stack keeps every Listing and Want each earlier run
 * left behind. In a shared City a test's one Listing becomes a Match, and a
 * notification, with each of those, so how long a test takes grows with how
 * many runs came before (#96). In the file's own City it pairs only with
 * the file's own rows.
 *
 * Vitest gives each test file its own module state, so the City is the
 * file's and not the run's.
 */
export function fileCity(): Promise<string> {
  ownCity ??= arrangeCity();
  return ownCity;
}

/** A Trader who has finished onboarding, in the file's own City unless told. */
export async function seedTrader(
  displayName: string,
  city?: string,
): Promise<SeededTrader> {
  const trader = await signUpTrader();
  const { error } = await trader.client.rpc('set_trader_profile', {
    display_name: displayName,
    city_id: await cityId(trader.client, city ?? (await fileCity())),
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

/** Examplemon's id and its Holofoil Variant, the pair most Matching tests list. */
export async function seededExamplemon(
  client: Client,
): Promise<{ card: number; holofoil: number }> {
  const card = await seededCard(client, EXAMPLEMON);
  const variant = card.card_variants.find((v) => v.name === 'Holofoil');
  if (!variant) throw new Error('No Holofoil Variant in the seeded Catalog');
  return { card: card.id, holofoil: variant.id };
}

/** The bucket a verification request's documents live in. */
export const VERIFICATION_DOCUMENTS_BUCKET = 'verification-documents';

export interface VerificationDocuments {
  id_document_path: string;
  selfie_path: string;
}

/**
 * An ID photo and a selfie, uploaded under the Trader's own prefix the way
 * the browser path uploads them, ready for `submit_verification`.
 */
export async function uploadVerificationDocuments(
  trader: SeededTrader,
): Promise<VerificationDocuments> {
  const documents = {
    id_document_path: `${trader.id}/${randomUUID()}-id.webp`,
    selfie_path: `${trader.id}/${randomUUID()}-selfie.webp`,
  };
  for (const path of Object.values(documents)) {
    const { error } = await trader.client.storage
      .from(VERIFICATION_DOCUMENTS_BUCKET)
      .upload(path, TINY_WEBP, { contentType: 'image/webp' });
    if (error) throw error;
  }
  return documents;
}

/** A Trader's submitted request: its id and the documents it names. */
export async function submitVerification(trader: SeededTrader) {
  const documents = await uploadVerificationDocuments(trader);
  const { data, error } = await trader.client.rpc(
    'submit_verification',
    documents,
  );
  if (error) throw error;
  return { requestId: data, ...documents };
}

/**
 * Reviews a request the way the review screen does: both documents deleted
 * through Storage, then the answer.
 */
export async function reviewVerification(
  founder: SeededTrader,
  request: VerificationDocuments & { requestId: string },
  answer: 'approve' | 'reject',
) {
  const { error: deleteError } = await founder.client.storage
    .from(VERIFICATION_DOCUMENTS_BUCKET)
    .remove([request.id_document_path, request.selfie_path]);
  if (deleteError) throw deleteError;
  const { error } = await founder.client.rpc(
    answer === 'approve' ? 'approve_verification' : 'reject_verification',
    { request_id: request.requestId },
  );
  if (error) throw error;
}
