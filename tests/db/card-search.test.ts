import { beforeAll, describe, expect, it } from 'vitest';
import { anonClient, seedTrader, serviceClient, type Client } from './seed.ts';

/*
 * Card search, the Catalog's one way in: a Trader types part of a Card's
 * name or collector number and gets the best few Cards back, ranked, from
 * every Card in the Catalog rather than from a first page of it.
 *
 * The sync, as service_role, seeds a set the size of the whole Catalog, so
 * "finds any Card" is proven at the scale the Catalog really has. Sets no
 * upstream has, so this file never touches what seam 2 syncs.
 */

const BULK_SET = 990_101;
const RANKING_SET = 990_102;
const OLDER_SET = 990_103;
const CATALOG_SIZE = 20_000;

/** A Card as the sync hands it to apply_catalog_set. */
function card(productId: number, name: string, number: string) {
  return { productId, name, number, rarity: 'Common', imageUrl: null };
}

async function sync(
  groupId: number,
  releasedOn: string,
  cards: ReturnType<typeof card>[],
) {
  const { error } = await serviceClient().rpc('apply_catalog_set', {
    card_set: { groupId, name: `Search Set ${groupId}`, releasedOn },
    cards,
    prices: cards.map(({ productId }) => ({
      productId,
      variant: 'Normal',
      marketPrice: 0.25,
    })),
    sync_day: '2026-09-19',
  });
  if (error) throw error;
}

async function search(client: Client, query: string) {
  const { data, error } = await client.rpc('search_cards', { query });
  if (error) throw error;
  return data;
}

describe('Card search', () => {
  let trader: Client;

  beforeAll(async () => {
    // The Catalog's size in one set, and the one Card a Trader is after
    // synced last, so it sits past any first page of the table.
    const bulk = Array.from({ length: CATALOG_SIZE - 1 }, (_, i) =>
      card(990_100_000 + i, `Filler Card ${i}`, `${i + 1}/${CATALOG_SIZE}`),
    );
    bulk.push(
      card(990_100_000 + CATALOG_SIZE, 'Zyzzyvamon', `${CATALOG_SIZE}/20000`),
    );
    await sync(BULK_SET, '2026-01-01', bulk);

    await sync(RANKING_SET, '2026-06-01', [
      card(990_102_001, 'Seamkrow ex', '012/150'),
      card(990_102_002, 'Dark Seamkrow', '077/150'),
      card(990_102_003, 'Seamkrow', '013/150'),
      card(990_102_004, 'Percent_100% Seamkrow', '099/150'),
    ]);
    await sync(OLDER_SET, '1999-01-09', [
      card(990_103_001, 'Seamkrow', '013/102'),
    ]);

    ({ client: trader } = await seedTrader('Searcher'));
  }, 60_000);

  it('finds any Card in a Catalog of 20k by part of its name', async () => {
    const found = await search(trader, 'zyzzyva');

    expect(found.map((c) => c.name)).toEqual(['Zyzzyvamon']);
  });

  it('matches regardless of case, and each word anywhere in the name', async () => {
    const found = await search(trader, 'KROW sEAM');

    expect(found.map((c) => c.name)).toContain('Dark Seamkrow');
    expect(found.every((c) => /seamkrow/i.test(c.name))).toBe(true);
  });

  it('narrows by collector number', async () => {
    const found = await search(trader, 'seamkrow 013/102');

    expect(found.map((c) => [c.name, c.number])).toEqual([
      ['Seamkrow', '013/102'],
    ]);
  });

  it('ranks names that start with the search first, then the newest set', async () => {
    // Read the way the search picker reads it, with each Card's set and
    // Variants alongside, so the ranking is proven to survive them.
    const { data: found, error } = await trader
      .rpc('search_cards', { query: 'seamkrow' })
      .select('name, number, card_sets (name), card_variants (name)')
      .order('name', { referencedTable: 'card_variants' });

    expect(error).toBeNull();
    expect(found!.map((c) => [c.name, c.number])).toEqual([
      // Start with it, newest set first, then by name.
      ['Seamkrow', '013/150'],
      ['Seamkrow ex', '012/150'],
      ['Seamkrow', '013/102'],
      // Contain it.
      ['Dark Seamkrow', '077/150'],
      ['Percent_100% Seamkrow', '099/150'],
    ]);
  });

  it('treats % and _ as the characters they are, not wildcards', async () => {
    expect((await search(trader, '100%')).map((c) => c.name)).toEqual([
      'Percent_100% Seamkrow',
    ]);
    expect(await search(trader, 'filler_card')).toEqual([]);
  });

  it('returns at most 20 Cards, however many match', async () => {
    const found = await search(trader, 'filler card');

    expect(found).toHaveLength(20);
  });

  it('returns nothing for a blank search', async () => {
    expect(await search(trader, '   ')).toEqual([]);
  });

  it('is not available to a signed-out visitor', async () => {
    const { data, error } = await anonClient().rpc('search_cards', {
      query: 'seamkrow',
    });

    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
  });
});
