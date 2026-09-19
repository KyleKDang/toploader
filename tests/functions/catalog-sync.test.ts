import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';
import { syncCatalog } from '../../scripts/catalog-sync/sync.ts';
import { serviceClient } from '../db/seed.ts';
import { startFakeTcgcsv, type FakeTcgcsv } from './fake-tcgcsv.ts';

/*
 * Seam 2: the Catalog sync run against the local stack, with TCGCSV faked at
 * the network edge by recorded fixtures. Assertions are on database state.
 *
 * The fixtures are three real sets, trimmed. Base Set (604) and ME: 30th
 * Celebration (24722) each have sealed product the Catalog must leave out and
 * a Card TCGCSV has no Market Price for; Scarlet & Violet 151 (23237) has a
 * Card in two Variants.
 */

const BASE_SET = 604;
const CELEBRATION = 24722;
const SV_151 = 23237;
const ALL_SETS = [BASE_SET, CELEBRATION, SV_151];
const ALAKAZAM = 42346;
const LIGHTNING_ENERGY = 42348;
const CHARIZARD_BLACK_DOT = 657516;
const GRENINJA_EX = 696676;
const SQUIRTLE = 502548;

interface RecordedPrices {
  results: { productId: number; marketPrice: number | null }[];
}
interface RecordedProducts {
  totalItems: number;
  results: { productId: number }[];
}

describe('Catalog sync', () => {
  let tcgcsv: FakeTcgcsv;
  const service = serviceClient();

  const sync = (asOf: string) =>
    syncCatalog({
      supabaseUrl: inject('supabaseUrl'),
      supabaseSecretKey: inject('supabaseSecretKey'),
      tcgcsvBaseUrl: tcgcsv.baseUrl,
      asOf,
      pauseMs: 0,
    });

  /** Serves the recorded prices of a set with one Card's Market Price changed. */
  async function reprice(
    groupId: number,
    productId: number,
    marketPrice: number,
  ) {
    const path = `/${groupId}/prices`;
    const prices = await tcgcsv.recorded<RecordedPrices>(path);
    for (const price of prices.results) {
      if (price.productId === productId) price.marketPrice = marketPrice;
    }
    tcgcsv.override(path, { body: prices });
  }

  async function cardsOfSet(groupId: number) {
    const { data, error } = await service
      .from('cards')
      .select(
        `id, tcgplayer_product_id, name, number, rarity, image_url,
         card_sets!inner (tcgplayer_group_id, name),
         card_variants (id, name, market_price_cents, market_price_as_of)`,
      )
      .eq('card_sets.tcgplayer_group_id', groupId)
      .order('tcgplayer_product_id');
    if (error) throw error;
    return data;
  }

  async function variantOf(productId: number) {
    const { data, error } = await service
      .from('card_variants')
      .select(
        `id, name, market_price_cents, market_price_as_of,
         cards!inner (tcgplayer_product_id),
         price_snapshots (as_of, market_price_cents)`,
      )
      .eq('cards.tcgplayer_product_id', productId)
      .order('as_of', { referencedTable: 'price_snapshots' })
      .single();
    if (error) throw error;
    return data;
  }

  beforeAll(async () => {
    tcgcsv = await startFakeTcgcsv();
  });

  afterAll(async () => {
    await tcgcsv.close();
  });

  // The Catalog outlives a test run, so each test starts from a database
  // that has never seen the fixture sets.
  beforeEach(async () => {
    tcgcsv.reset();
    const { error } = await service
      .from('card_sets')
      .delete()
      .in('tcgplayer_group_id', ALL_SETS);
    if (error) throw error;
  });

  it('lands Cards with their set, collector number, and image', async () => {
    const report = await sync('2026-09-19');

    expect(report.failed).toEqual([]);
    expect(report.applied.sort()).toEqual([...ALL_SETS].sort());

    const alakazam = (await cardsOfSet(BASE_SET)).find(
      (card) => card.tcgplayer_product_id === ALAKAZAM,
    );
    expect(alakazam).toMatchObject({
      name: 'Alakazam',
      number: '001/102',
      rarity: 'Holo Rare',
      image_url: 'https://tcgplayer-cdn.tcgplayer.com/product/42346_200w.jpg',
      card_sets: { name: 'Base Set' },
    });
  });

  it('names a Card without the collector number TCGCSV appends', async () => {
    await sync('2026-09-19');

    const [greninja] = (await cardsOfSet(CELEBRATION)).filter(
      (card) => card.tcgplayer_product_id === GRENINJA_EX,
    );
    expect(greninja).toMatchObject({ name: 'Greninja ex', number: '021/128' });
  });

  it('leaves sealed product out of the Catalog', async () => {
    await sync('2026-09-19');

    const names = (await cardsOfSet(BASE_SET)).map((card) => card.name);
    expect(names.sort()).toEqual([
      'Alakazam',
      'Charizard (Black Dot Error)',
      'Lightning Energy',
    ]);
  });

  it('lands each Variant with its Market Price and a first snapshot', async () => {
    await sync('2026-09-19');

    expect(await variantOf(ALAKAZAM)).toMatchObject({
      name: 'Holofoil',
      market_price_cents: 6859,
      market_price_as_of: '2026-09-19',
      price_snapshots: [{ as_of: '2026-09-19', market_price_cents: 6859 }],
    });
  });

  it('lands every Variant of a Card, each with its own Market Price', async () => {
    await sync('2026-09-19');

    const [squirtle] = await cardsOfSet(SV_151);
    expect(squirtle).toMatchObject({
      tcgplayer_product_id: SQUIRTLE,
      name: 'Squirtle',
      number: '007/165',
    });
    expect(
      squirtle.card_variants
        .map(({ name, market_price_cents }) => ({ name, market_price_cents }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ).toEqual([
      { name: 'Normal', market_price_cents: 28 },
      { name: 'Reverse Holofoil', market_price_cents: 46 },
    ]);
  });

  it('lands a Variant TCGCSV has no Market Price for, without a snapshot', async () => {
    await sync('2026-09-19');

    expect(await variantOf(CHARIZARD_BLACK_DOT)).toMatchObject({
      name: 'Holofoil',
      market_price_cents: null,
      market_price_as_of: null,
      price_snapshots: [],
    });
  });

  it('is idempotent: a re-run the same day changes nothing', async () => {
    await sync('2026-09-19');
    const before = [
      await cardsOfSet(BASE_SET),
      await cardsOfSet(CELEBRATION),
      await variantOf(ALAKAZAM),
    ];

    const report = await sync('2026-09-19');

    expect(report.failed).toEqual([]);
    expect([
      await cardsOfSet(BASE_SET),
      await cardsOfSet(CELEBRATION),
      await variantOf(ALAKAZAM),
    ]).toEqual(before);
  });

  it('replaces that day snapshot when a same-day re-run brings a new price', async () => {
    await sync('2026-09-19');
    await reprice(BASE_SET, ALAKAZAM, 70.01);

    await sync('2026-09-19');

    expect(await variantOf(ALAKAZAM)).toMatchObject({
      market_price_cents: 7001,
      price_snapshots: [{ as_of: '2026-09-19', market_price_cents: 7001 }],
    });
  });

  it('accumulates a snapshot per Variant only on a day its Market Price changed', async () => {
    await sync('2026-09-19');
    await sync('2026-09-20');
    await reprice(BASE_SET, ALAKAZAM, 70.01);
    await sync('2026-09-21');

    expect(await variantOf(ALAKAZAM)).toMatchObject({
      market_price_cents: 7001,
      market_price_as_of: '2026-09-21',
      price_snapshots: [
        { as_of: '2026-09-19', market_price_cents: 6859 },
        { as_of: '2026-09-21', market_price_cents: 7001 },
      ],
    });
    // Unchanged, so still one snapshot, but confirmed current as of today.
    expect(await variantOf(LIGHTNING_ENERGY)).toMatchObject({
      market_price_as_of: '2026-09-21',
      price_snapshots: [{ as_of: '2026-09-19', market_price_cents: 54 }],
    });
  });

  it('keeps the last Market Price when TCGCSV stops reporting one', async () => {
    await sync('2026-09-19');
    const prices = await tcgcsv.recorded<RecordedPrices>(`/${BASE_SET}/prices`);
    for (const price of prices.results) price.marketPrice = null;
    tcgcsv.override(`/${BASE_SET}/prices`, { body: prices });

    await sync('2026-09-20');

    expect(await variantOf(ALAKAZAM)).toMatchObject({
      market_price_cents: 6859,
      market_price_as_of: '2026-09-19',
    });
  });

  it('leaves a set whose upstream fails untouched, and still syncs the rest', async () => {
    await sync('2026-09-19');
    const lastGood = await cardsOfSet(BASE_SET);
    tcgcsv.override(`/${BASE_SET}/prices`, { status: 503 });
    await reprice(CELEBRATION, GRENINJA_EX, 0.75);

    const report = await sync('2026-09-20');

    expect(report.applied.sort()).toEqual([CELEBRATION, SV_151].sort());
    expect(report.failed).toEqual([
      { groupId: BASE_SET, reason: expect.stringContaining('503') as string },
    ]);
    expect(await cardsOfSet(BASE_SET)).toEqual(lastGood);
    expect(await variantOf(GRENINJA_EX)).toMatchObject({
      market_price_cents: 75,
      market_price_as_of: '2026-09-20',
    });
  });

  it('leaves everything untouched when TCGCSV is absent', async () => {
    await sync('2026-09-19');
    const lastGood = [
      await cardsOfSet(BASE_SET),
      await cardsOfSet(CELEBRATION),
    ];
    tcgcsv.override('/groups', { status: 500 });

    await expect(sync('2026-09-20')).rejects.toThrow(/500/);

    expect([await cardsOfSet(BASE_SET), await cardsOfSet(CELEBRATION)]).toEqual(
      lastGood,
    );
  });

  it('rejects a set TCGCSV reports as unsuccessful', async () => {
    await sync('2026-09-19');
    const lastGood = await cardsOfSet(BASE_SET);
    tcgcsv.override(`/${BASE_SET}/products`, {
      body: { success: false, errors: ['boom'], results: [] },
    });

    const report = await sync('2026-09-20');

    expect(report.failed.map((failure) => failure.groupId)).toEqual([BASE_SET]);
    expect(await cardsOfSet(BASE_SET)).toEqual(lastGood);
  });

  it('rejects a set whose Cards collapsed against the last-good Catalog', async () => {
    await sync('2026-09-19');
    const lastGood = await cardsOfSet(BASE_SET);
    const products = await tcgcsv.recorded<RecordedProducts>(
      `/${BASE_SET}/products`,
    );
    products.results = products.results.filter(
      (product) => product.productId === ALAKAZAM,
    );
    tcgcsv.override(`/${BASE_SET}/products`, { body: products });

    const report = await sync('2026-09-20');

    expect(report.failed).toEqual([
      {
        groupId: BASE_SET,
        reason: expect.stringContaining('collapsed') as string,
      },
    ]);
    expect(await cardsOfSet(BASE_SET)).toEqual(lastGood);
  });

  it('refuses to apply a day older than the set last synced', async () => {
    await sync('2026-09-19');
    await reprice(BASE_SET, ALAKAZAM, 1.0);

    const report = await sync('2026-09-18');

    expect(report.failed.map((failure) => failure.groupId)).toContain(BASE_SET);
    expect(await variantOf(ALAKAZAM)).toMatchObject({
      market_price_cents: 6859,
    });
  });

  it('thins snapshots older than 90 days to the last of each week', async () => {
    // Monday 2026-01-05 through Sunday 2026-01-11, a new price every day.
    for (let day = 5; day <= 11; day++) {
      await reprice(BASE_SET, ALAKAZAM, 60 + day);
      await sync(`2026-01-${String(day).padStart(2, '0')}`);
    }
    // The week the 90-day line falls in: 2026-06-21 is day 90 before the last
    // sync, so Friday and Saturday are old and Sunday is not. Saturday is the
    // last old day of its week, and Sunday being later does not thin it.
    for (const day of [19, 20, 21]) {
      await reprice(BASE_SET, ALAKAZAM, 50 + day);
      await sync(`2026-06-${day}`);
    }
    // Inside the 90 days: every changed day is kept.
    await reprice(BASE_SET, ALAKAZAM, 80);
    await sync('2026-09-18');
    await reprice(BASE_SET, ALAKAZAM, 81);
    await sync('2026-09-19');

    expect((await variantOf(ALAKAZAM)).price_snapshots).toEqual([
      { as_of: '2026-01-11', market_price_cents: 7100 },
      { as_of: '2026-06-20', market_price_cents: 7000 },
      { as_of: '2026-06-21', market_price_cents: 7100 },
      { as_of: '2026-09-18', market_price_cents: 8000 },
      { as_of: '2026-09-19', market_price_cents: 8100 },
    ]);
  });

  it('thins nothing on a day no set could be applied', async () => {
    for (const day of ['2026-01-05', '2026-01-06']) {
      await reprice(BASE_SET, ALAKAZAM, day === '2026-01-05' ? 65 : 66);
      await sync(day);
    }
    const lastGood = (await variantOf(ALAKAZAM)).price_snapshots;
    expect(lastGood).toHaveLength(2);
    for (const set of ALL_SETS) {
      tcgcsv.override(`/${set}/prices`, { status: 503 });
    }

    const report = await sync('2026-09-19');

    expect(report.applied).toEqual([]);
    expect((await variantOf(ALAKAZAM)).price_snapshots).toEqual(lastGood);
  });

  it('asks TCGCSV for the set list once, then each set once', async () => {
    await sync('2026-09-19');

    expect(tcgcsv.requests.sort()).toEqual(
      [
        '/groups',
        ...ALL_SETS.flatMap((set) => [`/${set}/products`, `/${set}/prices`]),
      ].sort(),
    );
  });
});
