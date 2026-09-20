import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Condition } from '../../src/lib/conditions.ts';
import { arrange, commitToTrade, completeTradeFor } from './arrange.ts';
import {
  anonClient,
  LISTING_PHOTOS_BUCKET,
  seedAdversarialTraders,
  seedTrader,
  TEST_CITY,
  TINY_WEBP,
  uploadListingPhoto,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * A Listing is a Copy a Trader has published as available for trading, with
 * photos of that actual Copy. Traders never write the table: a Listing is
 * created and withdrawn through named RPCs (ADR-0001), and read by the
 * Traders of its City.
 */
describe('Listings', () => {
  let actor: SeededTrader;
  let counterparty: SeededTrader;
  let foreign: SeededTrader;
  /** A Trader whose City is not the one the Listings are in. */
  let outsider: SeededTrader;
  let holofoil: number;

  beforeAll(async () => {
    [{ actor, counterparty, foreign }, outsider] = await Promise.all([
      seedAdversarialTraders(),
      seedTrader('Outsider', TEST_CITY),
    ]);
    holofoil = await variantId(actor.client, 'Examplemon', 'Holofoil');
  });

  it('goes active with its photos, Condition, and asking price', async () => {
    const photo = await uploadListingPhoto(actor);

    const listingId = await createListing(actor, {
      card_variant_id: holofoil,
      condition: 'LP',
      photos: [photo],
      asking_price_cents: 95000,
      open_to_cash_offers: true,
    });

    expect(await readListing(actor.client, listingId)).toEqual({
      id: listingId,
      trader_id: actor.id,
      card_variant_id: holofoil,
      condition: 'LP',
      asking_price_cents: 95000,
      open_to_cash_offers: true,
      status: 'active',
      listing_photos: [{ position: 1, ...photo }],
    });
  });

  it('keeps the photos in the order they were taken', async () => {
    const photos = [
      await uploadListingPhoto(actor),
      await uploadListingPhoto(actor),
      await uploadListingPhoto(actor),
    ];

    const listingId = await createListing(actor, {
      card_variant_id: holofoil,
      condition: 'NM',
      photos,
    });

    const listing = await readListing(actor.client, listingId);
    expect(listing.listing_photos).toEqual(
      photos.map((photo, index) => ({ position: index + 1, ...photo })),
    );
  });

  it('is listed with no price at all, where that is what the Trader wants', async () => {
    const listingId = await createListing(actor, {
      card_variant_id: holofoil,
      condition: 'MP',
      photos: [await uploadListingPhoto(actor)],
    });

    expect(await readListing(actor.client, listingId)).toMatchObject({
      asking_price_cents: null,
      open_to_cash_offers: false,
    });
  });

  it('is refused without a photo, and past five of them', async () => {
    const photo = await uploadListingPhoto(actor);

    const none = await actor.client.rpc('create_listing', {
      card_variant_id: holofoil,
      condition: 'NM',
      photos: [],
    });
    const tooMany = await actor.client.rpc('create_listing', {
      card_variant_id: holofoil,
      condition: 'NM',
      photos: Array.from({ length: 6 }, () => photo),
    });

    expect(none.error?.message).toMatch(/1 to 5 photos/);
    expect(tooMany.error?.message).toMatch(/1 to 5 photos/);
  });

  describe('in City browse', () => {
    let listingId: string;

    beforeAll(async () => {
      listingId = await createListing(actor, {
        card_variant_id: holofoil,
        condition: 'NM',
        photos: [await uploadListingPhoto(actor)],
        asking_price_cents: 120000,
      });
    });

    it('is read by another Trader in the same City, with its thumbnail', async () => {
      const listing = await browse(counterparty.client, listingId);

      expect(listing).toMatchObject({
        id: listingId,
        condition: 'NM',
        asking_price_cents: 120000,
        status: 'active',
        trader: { display_name: actor.displayName },
      });
      expect(listing?.listing_photos).toHaveLength(1);
      expect(listing?.listing_photos[0]?.thumbnail_path).toContain(actor.id);
    });

    it('is hidden from a Trader in another City, photos and all', async () => {
      expect(await browse(outsider.client, listingId)).toBeNull();
      expect(await readPhotos(outsider.client, listingId)).toEqual([]);
    });

    it('is hidden from a signed-out visitor', async () => {
      const { data, error } = await anonClient().from('listings').select('id');

      expect(data).toBeNull();
      expect(error?.code).toBe('42501');
    });

    it('cannot be edited or deleted by a foreign Trader', async () => {
      const edited = await foreign.client
        .from('listings')
        .update({ asking_price_cents: 1 })
        .eq('id', listingId);
      const deleted = await foreign.client
        .from('listings')
        .delete()
        .eq('id', listingId);

      expect(edited.error?.code).toBe('42501');
      expect(deleted.error?.code).toBe('42501');
      expect(await browse(counterparty.client, listingId)).toMatchObject({
        asking_price_cents: 120000,
      });
    });

    it('cannot be created by a foreign Trader from another Trader’s photos', async () => {
      const photo = await uploadListingPhoto(actor);

      const { error } = await foreign.client.rpc('create_listing', {
        card_variant_id: holofoil,
        condition: 'NM',
        photos: [photo],
      });

      expect(error?.code).toBe('42501');
    });

    it('has photo rows no Trader can write, their own included', async () => {
      const [photo] = await readPhotos(actor.client, listingId);
      if (!photo) throw new Error('The Listing has no photo');

      const added = await actor.client.from('listing_photos').insert({
        listing_id: listingId,
        position: 2,
        path: `${actor.id}/made-up.webp`,
        thumbnail_path: `${actor.id}/made-up-thumb.webp`,
      });
      const edited = await foreign.client
        .from('listing_photos')
        .update({ path: `${foreign.id}/swapped.webp` })
        .eq('listing_id', listingId);
      const deleted = await foreign.client
        .from('listing_photos')
        .delete()
        .eq('listing_id', listingId);

      expect(added.error?.code).toBe('42501');
      expect(edited.error?.code).toBe('42501');
      expect(deleted.error?.code).toBe('42501');
      expect(await readPhotos(actor.client, listingId)).toEqual([photo]);
    });

    it('is left out of the browse a Trader reads for a Card once it is not live', async () => {
      const kept = await createListing(actor, {
        card_variant_id: holofoil,
        condition: 'NM',
        photos: [await uploadListingPhoto(actor)],
      });
      const withdrawn = await createListing(actor, {
        card_variant_id: holofoil,
        condition: 'LP',
        photos: [await uploadListingPhoto(actor)],
      });
      await actor.client.rpc('withdraw_listing', { listing_id: withdrawn });

      // Read as the Trader who owns both: RLS lets them read their own
      // whatever state it is in, so browse is what has to leave one out.
      const browsed = (await browseCard(actor.client, kept)).map(
        ({ id }) => id,
      );

      expect(browsed).toContain(kept);
      expect(browsed).not.toContain(withdrawn);
    });
  });

  describe('through its lifecycle', () => {
    /** A fresh active Listing of the actor's, with one photo. */
    async function listed() {
      return createListing(actor, {
        card_variant_id: holofoil,
        condition: 'NM',
        photos: [await uploadListingPhoto(actor)],
      });
    }

    it('is withdrawn by its Trader, and leaves City browse', async () => {
      const listingId = await listed();

      const { error } = await actor.client.rpc('withdraw_listing', {
        listing_id: listingId,
      });

      expect(error).toBeNull();
      expect(await browse(counterparty.client, listingId)).toBeNull();
      // It is still the Trader's own, and still says when it was withdrawn,
      // which is what the reaper goes on.
      expect(await readListing(actor.client, listingId)).toMatchObject({
        status: 'withdrawn',
      });
    });

    it('cannot be withdrawn by a foreign Trader', async () => {
      const listingId = await listed();

      const { error } = await foreign.client.rpc('withdraw_listing', {
        listing_id: listingId,
      });

      expect(error?.code).toBe('42501');
      expect(await browse(counterparty.client, listingId)).toMatchObject({
        status: 'active',
      });
    });

    it('stops at withdrawn: it cannot be withdrawn twice', async () => {
      const listingId = await listed();
      await actor.client.rpc('withdraw_listing', { listing_id: listingId });

      const { error } = await actor.client.rpc('withdraw_listing', {
        listing_id: listingId,
      });

      expect(error?.message).toMatch(/withdrawn/);
    });

    it('cannot be withdrawn once it is committed to a Trade', async () => {
      const listingId = await listed();
      await commitToTrade(listingId);

      const { error } = await actor.client.rpc('withdraw_listing', {
        listing_id: listingId,
      });

      expect(error?.message).toMatch(/in_trade to withdrawn/);
    });

    it('leaves City browse once it is traded, and stays with its Trader', async () => {
      const listingId = await listed();

      await completeTradeFor(listingId);

      expect(await browse(counterparty.client, listingId)).toBeNull();
      expect(await readListing(actor.client, listingId)).toMatchObject({
        status: 'traded',
      });
    });

    it('refuses a transition the lifecycle does not have', async () => {
      const listingId = await listed();
      await completeTradeFor(listingId);

      await expect(
        arrange(
          (sql) =>
            sql`update public.listings set status = 'active' where id = ${listingId}`,
        ),
      ).rejects.toThrow(/traded to active/);
    });
  });

  /*
   * The bucket is private, so reading a photo is a permission question
   * rather than a matter of knowing the URL, and it carries its own limits,
   * which is what stops a client that skips the browser's compression path.
   */
  describe('photos in the bucket', () => {
    let photo: { path: string; thumbnail_path: string };

    beforeAll(async () => {
      photo = await uploadListingPhoto(actor);
      await createListing(actor, {
        card_variant_id: holofoil,
        condition: 'NM',
        photos: [photo],
      });
    });

    it('are served to a Trader who can see the Listing', async () => {
      const { data, error } = await counterparty.client.storage
        .from(LISTING_PHOTOS_BUCKET)
        .createSignedUrl(photo.thumbnail_path, 60);
      expect(error).toBeNull();

      const response = await fetch(data?.signedUrl ?? '');

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/webp');
    });

    it('are not served to a Trader in another City', async () => {
      const { data, error } = await outsider.client.storage
        .from(LISTING_PHOTOS_BUCKET)
        .download(photo.path);

      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });

    it('are not served to a signed-out visitor', async () => {
      const { data, error } = await anonClient()
        .storage.from(LISTING_PHOTOS_BUCKET)
        .download(photo.path);

      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });

    it('cannot be uploaded under another Trader’s prefix', async () => {
      const { error } = await foreign.client.storage
        .from(LISTING_PHOTOS_BUCKET)
        .upload(`${actor.id}/${randomUUID()}.webp`, TINY_WEBP, {
          contentType: 'image/webp',
        });

      expect(error).not.toBeNull();
    });

    it('are refused past the bucket’s own size limit', async () => {
      const { error } = await actor.client.storage
        .from(LISTING_PHOTOS_BUCKET)
        .upload(`${actor.id}/${randomUUID()}.webp`, Buffer.alloc(600 * 1024), {
          contentType: 'image/webp',
        });

      expect(error?.message).toMatch(/size/i);
    });

    it('are refused by the bucket unless they are WebP', async () => {
      const { error } = await actor.client.storage
        .from(LISTING_PHOTOS_BUCKET)
        .upload(`${actor.id}/${randomUUID()}.jpg`, Buffer.from('a photo'), {
          contentType: 'image/jpeg',
        });

      expect(error?.message).toMatch(/mime type/i);
    });

    it('cannot be deleted by another Trader, or by their own', async () => {
      await counterparty.client.storage
        .from(LISTING_PHOTOS_BUCKET)
        .remove([photo.path]);
      // Nor by the Trader who uploaded it: taking a Listing down is
      // withdrawing it, and the reaper is what reclaims the file.
      await actor.client.storage
        .from(LISTING_PHOTOS_BUCKET)
        .remove([photo.path]);

      const { error } = await actor.client.storage
        .from(LISTING_PHOTOS_BUCKET)
        .download(photo.path);
      expect(error).toBeNull();
    });

    it('stop being served the moment the Listing is withdrawn', async () => {
      const withdrawing = await uploadListingPhoto(actor);
      const listingId = await createListing(actor, {
        card_variant_id: holofoil,
        condition: 'NM',
        photos: [withdrawing],
      });
      const before = await counterparty.client.storage
        .from(LISTING_PHOTOS_BUCKET)
        .download(withdrawing.path);
      expect(before.error).toBeNull();

      await actor.client.rpc('withdraw_listing', { listing_id: listingId });

      const after = await counterparty.client.storage
        .from(LISTING_PHOTOS_BUCKET)
        .download(withdrawing.path);
      expect(after.data).toBeNull();
      expect(after.error).not.toBeNull();
    });

    it('are not listed for reaping by a Trader: that is the job’s own question', async () => {
      const { error } = await actor.client.rpc('unreferenced_listing_photos', {
        uploaded_before: new Date().toISOString(),
      });

      expect(error?.code).toBe('42501');
    });
  });
});

async function variantId(client: Client, card: string, variant: string) {
  const { data, error } = await client
    .from('card_variants')
    .select('id, cards!inner(name)')
    .eq('name', variant)
    .eq('cards.name', card)
    .single();
  if (error) throw error;
  return data.id;
}

type NewListing = {
  card_variant_id: number;
  condition: Condition;
  photos: { path: string; thumbnail_path: string }[];
  asking_price_cents?: number;
  open_to_cash_offers?: boolean;
};

async function createListing(trader: SeededTrader, listing: NewListing) {
  const { data, error } = await trader.client.rpc('create_listing', listing);
  if (error) throw error;
  return data;
}

/**
 * One Listing as City browse reads it: the thumbnail rather than the
 * full-size photo, and the Trader behind it. Null when the caller cannot see
 * it at all.
 */
async function browse(client: Client, id: string) {
  const { data, error } = await client
    .from('listings')
    .select(
      'id, condition, asking_price_cents, open_to_cash_offers, status, trader:traders(display_name), listing_photos(position, thumbnail_path)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * A Card's Listings as the card page's browse asks for them, filter and all,
 * so a test can see what that screen would show rather than what the policy
 * alone allows.
 */
async function browseCard(client: Client, likeListing: string) {
  const { data: card, error: cardError } = await client
    .from('listings')
    .select('card_variants(card_id)')
    .eq('id', likeListing)
    .single();
  if (cardError) throw cardError;

  const { data, error } = await client
    .from('listings')
    .select('id, status, card_variants!inner(card_id)')
    .eq('card_variants.card_id', card.card_variants.card_id)
    .in('status', ['active', 'in_trade']);
  if (error) throw error;
  return data;
}

async function readPhotos(client: Client, listingId: string) {
  const { data, error } = await client
    .from('listing_photos')
    .select('path, thumbnail_path')
    .eq('listing_id', listingId);
  if (error) throw error;
  return data;
}

/** A Listing as its own page reads it. */
async function readListing(client: Client, id: string) {
  const { data, error } = await client
    .from('listings')
    .select(
      'id, trader_id, card_variant_id, condition, asking_price_cents, open_to_cash_offers, status, listing_photos(position, path, thumbnail_path)',
    )
    .eq('id', id)
    .order('position', { referencedTable: 'listing_photos' })
    .single();
  if (error) throw error;
  return data;
}
