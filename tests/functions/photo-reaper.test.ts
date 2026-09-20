import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import { reapListingPhotos } from '../../scripts/photo-reaper/reap.ts';
import { ageUpload, completeTradeFor } from '../db/arrange.ts';
import {
  LISTING_PHOTOS_BUCKET,
  seedTrader,
  serviceClient,
  TINY_WEBP,
  uploadListingPhoto,
  type SeededTrader,
} from '../db/seed.ts';

/*
 * Seam 2: the scheduled job that reclaims the Storage a withdrawn Listing no
 * longer needs, run against the local stack. Assertions are on what is left
 * in the bucket.
 *
 * The 1 GB free tier is the whole reason it exists (ADR-0006). What it must
 * never touch is the photos of a Listing that went through a Trade: those
 * are the Trade Record's evidence, and the Trade Record is immutable.
 */
describe('Listing photo reaper', () => {
  const service = serviceClient();
  let trader: SeededTrader;
  let holofoil: number;

  const reap = () =>
    reapListingPhotos({
      supabaseUrl: inject('supabaseUrl'),
      supabaseSecretKey: inject('supabaseSecretKey'),
    });

  beforeAll(async () => {
    trader = await seedTrader('Reaper Trader');
    const { data, error } = await trader.client
      .from('card_variants')
      .select('id, cards!inner(name)')
      .eq('name', 'Holofoil')
      .eq('cards.name', 'Examplemon')
      .single();
    if (error) throw error;
    holofoil = data.id;
  });

  /** An active Listing with one photo, and the photo's two paths. */
  async function listed() {
    const photo = await uploadListingPhoto(trader);
    const { data, error } = await trader.client.rpc('create_listing', {
      card_variant_id: holofoil,
      condition: 'NM',
      photos: [photo],
    });
    if (error) throw error;
    return { listingId: data, photo };
  }

  async function isStored(path: string) {
    const { error } = await service.storage
      .from(LISTING_PHOTOS_BUCKET)
      .download(path);
    return error === null;
  }

  it('reclaims both files of a withdrawn Listing, and forgets the rows', async () => {
    const { listingId, photo } = await listed();
    await trader.client.rpc('withdraw_listing', { listing_id: listingId });

    await reap();

    expect(await isStored(photo.path)).toBe(false);
    expect(await isStored(photo.thumbnail_path)).toBe(false);
    const { data } = await service
      .from('listing_photos')
      .select('id')
      .eq('listing_id', listingId);
    expect(data).toEqual([]);
  });

  it('never reclaims the photos of a Listing inside a completed Trade', async () => {
    const { listingId, photo } = await listed();
    await completeTradeFor(listingId);

    await reap();

    expect(await isStored(photo.path)).toBe(true);
    expect(await isStored(photo.thumbnail_path)).toBe(true);
  });

  it('leaves an active Listing alone', async () => {
    const { photo } = await listed();

    await reap();

    expect(await isStored(photo.path)).toBe(true);
  });

  it('reclaims an upload that never became a Listing', async () => {
    const abandoned = `${trader.id}/${randomUUID()}.webp`;
    const { error } = await trader.client.storage
      .from(LISTING_PHOTOS_BUCKET)
      .upload(abandoned, TINY_WEBP, { contentType: 'image/webp' });
    if (error) throw error;
    // Left sitting past the grace period, no Listing ever coming for it.
    await ageUpload(abandoned, 2);

    await reap();

    expect(await isStored(abandoned)).toBe(false);
  });

  it('leaves a fresh upload alone: its Listing is still being written', async () => {
    const pending = `${trader.id}/${randomUUID()}.webp`;
    const { error } = await trader.client.storage
      .from(LISTING_PHOTOS_BUCKET)
      .upload(pending, TINY_WEBP, { contentType: 'image/webp' });
    if (error) throw error;

    await reap();

    expect(await isStored(pending)).toBe(true);
  });
});
