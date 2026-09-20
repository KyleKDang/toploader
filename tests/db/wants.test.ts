import { beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  seedAdversarialTraders,
  seedTrader,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * Wants: the Cards a Trader is looking for, and the other half of Matching.
 * A Want names a Card; the Variant and the minimum Condition are optional
 * narrowings, and a Want that sets neither is satisfied by any Copy of the
 * Card.
 *
 * A Want is private to its owner, so every test here runs with a foreign
 * Trader in the file who must be denied both the read and the write.
 */

/** Cards from the made-up set supabase/seed.sql syncs. */
const EXAMPLEMON = 990_900_001;
const EXAMPLEMON_EX = 990_900_002;

describe('Wants', () => {
  let actor: SeededTrader;
  let foreign: SeededTrader;
  let examplemon: CatalogCard;
  let examplemonEx: CatalogCard;

  beforeAll(async () => {
    ({ actor, foreign } = await seedAdversarialTraders());
    [examplemon, examplemonEx] = await Promise.all([
      readCard(actor.client, EXAMPLEMON),
      readCard(actor.client, EXAMPLEMON_EX),
    ]);
  });

  it('names a Card, with no narrowing at all', async () => {
    const trader = await freshTrader();

    await addWant(trader.client, { card_id: examplemon.id });

    expect(await readWants(trader.client)).toEqual([
      {
        id: expect.any(String) as string,
        card_id: examplemon.id,
        card_variant_id: null,
        min_condition: null,
      },
    ]);
  });

  it('narrows to a Variant, to a minimum Condition, or to both', async () => {
    const trader = await freshTrader();
    const [holofoil] = examplemon.card_variants;

    await addWant(trader.client, {
      card_id: examplemon.id,
      card_variant_id: holofoil.id,
    });
    await addWant(trader.client, {
      card_id: examplemon.id,
      min_condition: 'LP',
    });
    await addWant(trader.client, {
      card_id: examplemon.id,
      card_variant_id: holofoil.id,
      min_condition: 'NM',
    });

    expect(await readWants(trader.client)).toEqual(
      [
        { card_variant_id: holofoil.id, min_condition: null },
        { card_variant_id: null, min_condition: 'LP' },
        { card_variant_id: holofoil.id, min_condition: 'NM' },
      ].map((want) => ({
        id: expect.any(String) as string,
        card_id: examplemon.id,
        ...want,
      })),
    );
  });

  it('is one Want however many times the same one is added', async () => {
    const trader = await freshTrader();
    const want = { card_id: examplemon.id, min_condition: 'MP' as const };

    const first = await addWant(trader.client, want);
    const again = await addWant(trader.client, want);

    expect(again).toBe(first);
    expect(await readWants(trader.client)).toHaveLength(1);
  });

  it('is removed by its owner', async () => {
    const trader = await freshTrader();
    const kept = await addWant(trader.client, { card_id: examplemon.id });
    const dropped = await addWant(trader.client, { card_id: examplemonEx.id });

    const { error } = await trader.client.rpc('remove_want', {
      want_id: dropped,
    });

    expect(error).toBeNull();
    expect((await readWants(trader.client)).map((want) => want.id)).toEqual([
      kept,
    ]);
  });

  it('refuses a Variant that belongs to a different Card', async () => {
    const [holofoil] = examplemon.card_variants;

    const { error } = await actor.client.rpc('add_want', {
      card_id: examplemonEx.id,
      card_variant_id: holofoil.id,
    });

    // The Want's Card and Variant are one foreign key, so a Variant of
    // another Card cannot be stored at all.
    expect(error?.code).toBe('23503');
  });

  it('is hidden from a foreign Trader', async () => {
    await addWant(actor.client, { card_id: examplemon.id });

    expect(await readWants(foreign.client)).toEqual([]);
  });

  it('cannot be removed by a foreign Trader', async () => {
    const want = await addWant(actor.client, { card_id: examplemonEx.id });

    const { error } = await foreign.client.rpc('remove_want', {
      want_id: want,
    });

    // The same answer a want_id that exists nowhere gets, so a foreign
    // Trader cannot learn which ids are real.
    expect(error?.code).toBe('P0002');
    expect((await readWants(actor.client)).map((w) => w.id)).toContain(want);
  });

  it('is never written by a client directly, only through the RPCs', async () => {
    const want = await addWant(actor.client, { card_id: examplemon.id });

    const inserted = await actor.client
      .from('wants')
      .insert({ trader_id: actor.id, card_id: examplemonEx.id });
    const updated = await actor.client
      .from('wants')
      .update({ min_condition: 'DMG' })
      .eq('id', want);
    const deleted = await actor.client.from('wants').delete().eq('id', want);

    expect(inserted.error?.code).toBe('42501');
    expect(updated.error?.code).toBe('42501');
    expect(deleted.error?.code).toBe('42501');
    expect((await readWants(actor.client)).map((w) => w.id)).toContain(want);
  });

  it('cannot be written for, or over, another Trader by a foreign one', async () => {
    const want = await addWant(actor.client, { card_id: examplemon.id });

    // Planting a Want on someone else, and tampering with one they hold.
    const planted = await foreign.client
      .from('wants')
      .insert({ trader_id: actor.id, card_id: examplemonEx.id });
    const tampered = await foreign.client
      .from('wants')
      .update({ min_condition: 'DMG' })
      .eq('id', want);
    const deleted = await foreign.client.from('wants').delete().eq('id', want);

    expect(planted.error?.code).toBe('42501');
    expect(tampered.error?.code).toBe('42501');
    expect(deleted.error?.code).toBe('42501');
    expect(await readWants(foreign.client)).toEqual([]);
    expect((await readWants(actor.client)).map((w) => w.id)).toContain(want);
  });

  it('is out of reach of a signed-out visitor', async () => {
    const anon = anonClient();

    const read = await anon.from('wants').select('id');
    const added = await anon.rpc('add_want', { card_id: examplemon.id });

    expect(read.data).toBeNull();
    expect(read.error?.code).toBe('42501');
    expect(added.error?.code).toBe('42501');
  });
});

type CatalogCard = { id: number; card_variants: { id: number }[] };

async function readCard(
  client: Client,
  productId: number,
): Promise<CatalogCard> {
  const { data, error } = await client
    .from('cards')
    .select('id, card_variants (id)')
    .eq('tcgplayer_product_id', productId)
    .order('name', { referencedTable: 'card_variants' })
    .single();
  if (error) throw error;
  return data;
}

/**
 * A Trader of their own, for the tests that count a whole Wants list: the
 * adversarial pair is shared across this file, so its Wants accumulate.
 */
function freshTrader() {
  return seedTrader('Actor');
}

async function addWant(
  client: Client,
  want: {
    card_id: number;
    card_variant_id?: number;
    min_condition?: 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
  },
): Promise<string> {
  const { data, error } = await client.rpc('add_want', want);
  if (error) throw error;
  return data;
}

/** A Trader's own Wants, oldest first, as the select policy hands them over. */
async function readWants(client: Client) {
  const { data, error } = await client
    .from('wants')
    .select('id, card_id, card_variant_id, min_condition')
    .order('created_at');
  if (error) throw error;
  return data;
}
