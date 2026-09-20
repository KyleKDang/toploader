import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../../src/lib/database.types.ts';
import {
  anonClient,
  seedTrader,
  serviceClient,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * A Collection is a Trader's private inventory of the Copies they own: a
 * Card in a Variant and a Condition, and how many of them. It is visible
 * only to its owner, and every change goes through a named RPC (ADR-0001),
 * so the adversarial pair here is the owner and a foreign Trader who must be
 * able to neither read nor write what the owner holds.
 *
 * The Catalog is a set no upstream has, synced as service_role the way the
 * daily job would, so the Market Prices a Collection is valued at are fixed
 * by this file rather than borrowed from what seam 2 syncs.
 */

const COLLECTION_SET = 990_201;
const HOLOFOIL_CENTS = 1_000;
const REVERSE_HOLOFOIL_CENTS = 250;

type Condition = Database['public']['Enums']['card_condition'];

let holofoil: number;
let reverseHolofoil: number;
/** A Variant TCGCSV lists but does not price. */
let unpriced: number;

describe('Collection', () => {
  let actor: SeededTrader;
  let foreign: SeededTrader;

  beforeAll(async () => {
    await syncCollectionSet();
    [holofoil, reverseHolofoil, unpriced] = await Promise.all([
      variantId('Holofoil'),
      variantId('Reverse Holofoil'),
      variantId('Unlimited'),
    ]);
  }, 30_000);

  // Fresh Traders per test, so one test's Copies are never another's.
  beforeEach(async () => {
    [actor, foreign] = await Promise.all([
      seedTrader('Actor'),
      seedTrader('Foreign'),
    ]);
  });

  it('holds a Copy a Trader adds, with its Variant, Condition, and quantity', async () => {
    await addToCollection(actor.client, holofoil, 'NM', 2);

    expect(await readCollection(actor.client)).toEqual([
      { card_variant_id: holofoil, condition: 'NM', quantity: 2 },
    ]);
  });

  it('keeps a Copy in one entry: adding it again adds to that quantity', async () => {
    const first = await addToCollection(actor.client, holofoil, 'NM', 2);
    const again = await addToCollection(actor.client, holofoil, 'NM', 1);

    expect(again).toBe(first);
    expect(await readCollection(actor.client)).toEqual([
      { card_variant_id: holofoil, condition: 'NM', quantity: 3 },
    ]);
  });

  it('holds the same Variant in another Condition as its own entry', async () => {
    await addToCollection(actor.client, holofoil, 'NM', 2);
    await addToCollection(actor.client, holofoil, 'LP', 1);

    expect(await readCollection(actor.client)).toEqual([
      { card_variant_id: holofoil, condition: 'NM', quantity: 2 },
      { card_variant_id: holofoil, condition: 'LP', quantity: 1 },
    ]);
  });

  it('changes the quantity of an entry the Trader owns', async () => {
    const entry = await addToCollection(actor.client, holofoil, 'NM', 2);

    const { error } = await setQuantity(actor.client, entry, 5);

    expect(error).toBeNull();
    expect(await readCollection(actor.client)).toEqual([
      { card_variant_id: holofoil, condition: 'NM', quantity: 5 },
    ]);
  });

  it('removes an entry the Trader owns', async () => {
    const entry = await addToCollection(actor.client, holofoil, 'NM', 2);
    await addToCollection(actor.client, reverseHolofoil, 'LP', 1);

    const { error } = await remove(actor.client, entry);

    expect(error).toBeNull();
    expect(await readCollection(actor.client)).toEqual([
      { card_variant_id: reverseHolofoil, condition: 'LP', quantity: 1 },
    ]);
  });

  it('refuses a quantity below one, which is a removal rather than an entry', async () => {
    const entry = await addToCollection(actor.client, holofoil, 'NM', 2);

    const added = await actor.client.rpc('add_to_collection', {
      card_variant_id: holofoil,
      condition: 'LP',
      quantity: 0,
    });
    const set = await setQuantity(actor.client, entry, 0);

    expect(added.error?.code).toBe('22023');
    expect(set.error?.code).toBe('22023');
    expect(await readCollection(actor.client)).toEqual([
      { card_variant_id: holofoil, condition: 'NM', quantity: 2 },
    ]);
  });

  describe('total value', () => {
    it('is every Copy at its Variant’s Market Price', async () => {
      await addToCollection(actor.client, holofoil, 'NM', 2);
      await addToCollection(actor.client, reverseHolofoil, 'LP', 3);

      expect(await readValue(actor.client)).toEqual({
        copy_count: 5,
        total_cents: 2 * HOLOFOIL_CENTS + 3 * REVERSE_HOLOFOIL_CENTS,
        unpriced_copy_count: 0,
      });
    });

    it('follows a quantity change and a removal', async () => {
      const entry = await addToCollection(actor.client, holofoil, 'NM', 2);
      const gone = await addToCollection(
        actor.client,
        reverseHolofoil,
        'LP',
        1,
      );

      await setQuantity(actor.client, entry, 3);
      await remove(actor.client, gone);

      expect(await readValue(actor.client)).toEqual({
        copy_count: 3,
        total_cents: 3 * HOLOFOIL_CENTS,
        unpriced_copy_count: 0,
      });
    });

    it('counts a Copy whose Variant has no Market Price rather than valuing it', async () => {
      await addToCollection(actor.client, holofoil, 'NM', 2);
      await addToCollection(actor.client, unpriced, 'HP', 1);

      expect(await readValue(actor.client)).toEqual({
        copy_count: 3,
        total_cents: 2 * HOLOFOIL_CENTS,
        unpriced_copy_count: 1,
      });
    });

    it('is nothing at all until the Trader owns a Copy', async () => {
      expect(await readValue(actor.client)).toBeNull();
    });
  });

  describe('another Trader’s Collection', () => {
    it('cannot be read by a foreign Trader', async () => {
      await addToCollection(actor.client, holofoil, 'NM', 2);

      expect(await readCollection(foreign.client)).toEqual([]);
      expect(await readValue(foreign.client)).toBeNull();
    });

    it('cannot have its quantity changed by a foreign Trader', async () => {
      const entry = await addToCollection(actor.client, holofoil, 'NM', 2);

      const { error } = await setQuantity(foreign.client, entry, 99);

      expect(error?.code).toBe('P0002');
      expect(await readCollection(actor.client)).toEqual([
        { card_variant_id: holofoil, condition: 'NM', quantity: 2 },
      ]);
    });

    it('cannot have an entry removed by a foreign Trader', async () => {
      const entry = await addToCollection(actor.client, holofoil, 'NM', 2);

      const { error } = await remove(foreign.client, entry);

      expect(error?.code).toBe('P0002');
      expect(await readCollection(actor.client)).toEqual([
        { card_variant_id: holofoil, condition: 'NM', quantity: 2 },
      ]);
    });

    it('cannot have a Copy added to it by a foreign Trader', async () => {
      await addToCollection(actor.client, holofoil, 'NM', 2);

      // add_to_collection names no Trader, so the only Collection a foreign
      // Trader can reach with it is their own: what they add lands there and
      // the actor's is untouched. That is the denial for this RPC - there is
      // no argument through which to aim it at someone else.
      await addToCollection(foreign.client, holofoil, 'NM', 7);

      expect(await readCollection(actor.client)).toEqual([
        { card_variant_id: holofoil, condition: 'NM', quantity: 2 },
      ]);
      expect(await readCollection(foreign.client)).toEqual([
        { card_variant_id: holofoil, condition: 'NM', quantity: 7 },
      ]);
    });

    it('cannot be added to by a signed-out visitor at all', async () => {
      const { error } = await anonClient().rpc('add_to_collection', {
        card_variant_id: holofoil,
        condition: 'NM',
        quantity: 1,
      });

      expect(error?.code).toBe('42501');
    });
  });

  it('is not written directly by any Trader, only through the RPCs', async () => {
    const entry = await addToCollection(actor.client, holofoil, 'NM', 2);

    const inserted = await actor.client.from('collection_entries').insert({
      trader_id: actor.id,
      card_variant_id: reverseHolofoil,
      condition: 'NM',
      quantity: 1,
    });
    const updated = await actor.client
      .from('collection_entries')
      .update({ quantity: 99 })
      .eq('id', entry);
    const deleted = await actor.client
      .from('collection_entries')
      .delete()
      .eq('id', entry);

    expect(inserted.error?.code).toBe('42501');
    expect(updated.error?.code).toBe('42501');
    expect(deleted.error?.code).toBe('42501');
    expect(await readCollection(actor.client)).toEqual([
      { card_variant_id: holofoil, condition: 'NM', quantity: 2 },
    ]);
  });

  it('is not readable by a signed-out visitor', async () => {
    await addToCollection(actor.client, holofoil, 'NM', 2);

    const entries = await anonClient().from('collection_entries').select('id');
    const value = await anonClient().from('collection_value').select('*');

    expect(entries.error?.code).toBe('42501');
    expect(value.error?.code).toBe('42501');
  });
});

/**
 * One Card in three Variants, two priced and one not, applied through the
 * sync's own function so this Catalog takes the path production's does.
 */
async function syncCollectionSet() {
  const { error } = await serviceClient().rpc('apply_catalog_set', {
    card_set: {
      groupId: COLLECTION_SET,
      name: 'Collection Set',
      releasedOn: '2026-05-01',
    },
    cards: [
      {
        productId: 990_201_001,
        name: 'Collectamon',
        number: '001/100',
        rarity: 'Holo Rare',
        imageUrl: null,
      },
    ],
    prices: [
      {
        productId: 990_201_001,
        variant: 'Holofoil',
        marketPrice: HOLOFOIL_CENTS / 100,
      },
      {
        productId: 990_201_001,
        variant: 'Reverse Holofoil',
        marketPrice: REVERSE_HOLOFOIL_CENTS / 100,
      },
      { productId: 990_201_001, variant: 'Unlimited', marketPrice: null },
    ],
    sync_day: '2026-09-19',
  });
  if (error) throw error;
}

async function variantId(variantName: string) {
  const { data, error } = await serviceClient()
    .from('card_variants')
    .select('id, cards!inner(card_sets!inner(tcgplayer_group_id))')
    .eq('name', variantName)
    .eq('cards.card_sets.tcgplayer_group_id', COLLECTION_SET)
    .single();
  if (error) throw error;
  return data.id;
}

async function addToCollection(
  client: Client,
  cardVariantId: number,
  condition: Condition,
  quantity: number,
) {
  const { data, error } = await client.rpc('add_to_collection', {
    card_variant_id: cardVariantId,
    condition,
    quantity,
  });
  if (error) throw error;
  return data;
}

function setQuantity(client: Client, entryId: string, quantity: number) {
  return client.rpc('set_collection_quantity', {
    entry_id: entryId,
    quantity,
  });
}

function remove(client: Client, entryId: string) {
  return client.rpc('remove_from_collection', { entry_id: entryId });
}

async function readCollection(client: Client) {
  const { data, error } = await client
    .from('collection_entries')
    .select('card_variant_id, condition, quantity')
    // Oldest first, so a test reads its Copies back in the order it added
    // them; the Collection screen reads the same rows newest first.
    .order('created_at');
  if (error) throw error;
  return data;
}

/** The one total-value line a Collection shows, or null when it is empty. */
async function readValue(client: Client) {
  const { data, error } = await client
    .from('collection_value')
    .select('copy_count, total_cents, unpriced_copy_count')
    .maybeSingle();
  if (error) throw error;
  return data;
}
