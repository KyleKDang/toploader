import { beforeAll, describe, expect, it } from 'vitest';
import { anonClient, seedTrader, serviceClient, type Client } from './seed.ts';

/*
 * The Catalog is read-only to clients: a Trader reads every table and writes
 * none, by table or by the sync's own functions. The sync, as service_role,
 * seeds one Card here; how a sync behaves is proven at seam 2.
 */

// A set no upstream has, so this file never touches what seam 2 syncs.
const TEST_SET = 990_001;
const TEST_CARD = 990_000_001;

const CATALOG_TABLES = [
  'card_sets',
  'cards',
  'card_variants',
  'price_snapshots',
] as const;

const syncArguments = {
  card_set: {
    groupId: TEST_SET,
    name: 'Seam One Set',
    abbreviation: 'S1',
    releasedOn: '2026-01-01',
  },
  cards: [
    {
      productId: TEST_CARD,
      name: 'Testachu',
      number: '001/001',
      rarity: 'Common',
      imageUrl: null,
    },
  ],
  prices: [{ productId: TEST_CARD, variant: 'Normal', marketPrice: 1.23 }],
  sync_day: '2026-09-19',
};

describe('The Catalog', () => {
  let trader: Client;
  let variantId: number;

  beforeAll(async () => {
    const service = serviceClient();
    const { error } = await service.rpc('apply_catalog_set', syncArguments);
    if (error) throw error;

    ({ client: trader } = await seedTrader('Reader'));
    const { data } = await trader
      .from('card_variants')
      .select('id, cards!inner (tcgplayer_product_id)')
      .eq('cards.tcgplayer_product_id', TEST_CARD)
      .single();
    variantId = data!.id;
  });

  it('shows a Trader a Card with its Variants, Market Price, and history', async () => {
    const { data, error } = await trader
      .from('cards')
      .select(
        `name, number, card_sets (name),
         card_variants (name, market_price_cents, price_snapshots (as_of))`,
      )
      .eq('tcgplayer_product_id', TEST_CARD)
      .single();

    expect(error).toBeNull();
    expect(data).toEqual({
      name: 'Testachu',
      number: '001/001',
      card_sets: { name: 'Seam One Set' },
      card_variants: [
        {
          name: 'Normal',
          market_price_cents: 123,
          price_snapshots: [{ as_of: '2026-09-19' }],
        },
      ],
    });
  });

  it.each(CATALOG_TABLES)(
    'is not readable by a signed-out visitor: %s',
    async (table) => {
      const { data, error } = await anonClient().from(table).select('*');

      expect(data).toBeNull();
      expect(error?.code).toBe('42501');
    },
  );

  it('cannot be added to by a Trader', async () => {
    const attempts = await Promise.all([
      trader.from('card_sets').insert({
        tcgplayer_group_id: TEST_SET + 1,
        name: 'Forged Set',
        synced_as_of: '2026-09-19',
      }),
      trader.from('cards').insert({
        card_set_id: 1,
        tcgplayer_product_id: TEST_CARD + 1,
        name: 'Forged Card',
        number: '1',
      }),
      trader
        .from('card_variants')
        .insert({ card_id: 1, name: 'Forged Variant' }),
      trader.from('price_snapshots').insert({
        card_variant_id: variantId,
        as_of: '2026-09-20',
        market_price_cents: 1,
      }),
    ]);

    expect(attempts.map(({ error }) => error?.code)).toEqual(
      CATALOG_TABLES.map(() => '42501'),
    );
  });

  it('cannot be renamed by a Trader', async () => {
    const set = await trader
      .from('card_sets')
      .update({ name: 'Forged Set' })
      .eq('tcgplayer_group_id', TEST_SET);
    const card = await trader
      .from('cards')
      .update({ name: 'Forged Card' })
      .eq('tcgplayer_product_id', TEST_CARD);

    expect(set.error?.code).toBe('42501');
    expect(card.error?.code).toBe('42501');
  });

  it('cannot be repriced by a Trader', async () => {
    const variant = await trader
      .from('card_variants')
      .update({ market_price_cents: 99_999_00 })
      .eq('id', variantId);
    const snapshot = await trader
      .from('price_snapshots')
      .update({ market_price_cents: 99_999_00 })
      .eq('card_variant_id', variantId);

    expect(variant.error?.code).toBe('42501');
    expect(snapshot.error?.code).toBe('42501');
  });

  it('cannot be deleted from by a Trader', async () => {
    const attempts = await Promise.all([
      trader.from('card_sets').delete().eq('tcgplayer_group_id', TEST_SET),
      trader.from('cards').delete().eq('tcgplayer_product_id', TEST_CARD),
      trader.from('card_variants').delete().eq('id', variantId),
      trader.from('price_snapshots').delete().eq('card_variant_id', variantId),
    ]);

    expect(attempts.map(({ error }) => error?.code)).toEqual(
      CATALOG_TABLES.map(() => '42501'),
    );
  });

  it('cannot be synced or compacted by a Trader', async () => {
    const applied = await trader.rpc('apply_catalog_set', {
      ...syncArguments,
      prices: [{ productId: TEST_CARD, variant: 'Normal', marketPrice: 9999 }],
    });
    const compacted = await trader.rpc('compact_price_snapshots', {
      sync_day: '2099-01-01',
    });

    expect(applied.error?.code).toBe('42501');
    expect(compacted.error?.code).toBe('42501');
  });

  it('cannot be synced by a signed-out visitor', async () => {
    const { error } = await anonClient().rpc(
      'apply_catalog_set',
      syncArguments,
    );

    expect(error?.code).toBe('42501');
  });

  it('still holds the Market Price the sync set, after every attempt', async () => {
    const { data } = await trader
      .from('card_variants')
      .select('market_price_cents')
      .eq('id', variantId)
      .single();

    expect(data?.market_price_cents).toBe(123);
  });
});
