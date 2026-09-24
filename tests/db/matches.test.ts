import { beforeAll, describe, expect, it } from 'vitest';
import type { Condition } from '../../src/lib/conditions.ts';
import { cancelTradeFor, commitToTrade, completeTradeFor } from './arrange.ts';
import {
  anonClient,
  cityId,
  ORANGE_COUNTY,
  seedTrader,
  serviceClient,
  TEST_CITY,
  uploadListingPhoto,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * Matching: a Match is one Trader's active Listing satisfying another
 * Trader's Want, within one City. Both Traders see it, nobody else does, and
 * each new pair is recorded exactly once so the notification for it (#20)
 * fires once.
 *
 * Every test seeds Traders of its own. The stack is shared with every other
 * test file and every earlier run, so the City is full of other Listings
 * and Wants for the same Cards; a test only ever asks about its own
 * Listing, never counts a whole Matches view.
 */

/** Cards from the made-up set supabase/seed.sql syncs. */
const EXAMPLEMON = 990_900_001;
const EXAMPLEMON_EX = 990_900_002;

describe('Matches', () => {
  let examplemon: number;
  let examplemonEx: number;
  let holofoil: number;
  let reverseHolofoil: number;
  let exNormal: number;

  beforeAll(async () => {
    const client = (await seedTrader('Catalog reader')).client;
    const [card, exCard] = await Promise.all([
      readCard(client, EXAMPLEMON),
      readCard(client, EXAMPLEMON_EX),
    ]);
    examplemon = card.id;
    holofoil = variantNamed(card, 'Holofoil');
    reverseHolofoil = variantNamed(card, 'Reverse Holofoil');
    examplemonEx = exCard.id;
    exNormal = variantNamed(exCard, 'Normal');
  });

  /**
   * The default shape: a Trader who lists, a Trader who wants, and a foreign
   * Trader in the same City who is party to neither.
   */
  async function seedPair() {
    const [lister, wanter, foreign] = await Promise.all([
      seedTrader('Lister'),
      seedTrader('Wanter'),
      seedTrader('Foreign'),
    ]);
    return { lister, wanter, foreign };
  }

  it('appears for both Traders when a Listing satisfies a Want in their City', async () => {
    const { lister, wanter } = await seedPair();
    await addWant(wanter, { card_id: examplemon });

    const listingId = await list(lister, holofoil, 'NM');

    const expected = {
      listing_id: listingId,
      lister_id: lister.id,
      wanter_id: wanter.id,
    };
    expect(await matchFor(wanter.client, listingId, wanter.id)).toMatchObject(
      expected,
    );
    expect(await matchFor(lister.client, listingId, wanter.id)).toMatchObject(
      expected,
    );
  });

  it('appears whichever came first, the Listing or the Want', async () => {
    const { lister, wanter } = await seedPair();
    const listingId = await list(lister, holofoil, 'NM');

    await addWant(wanter, { card_id: examplemon });

    expect(await matchFor(wanter.client, listingId, wanter.id)).toMatchObject({
      wanter_id: wanter.id,
    });
  });

  it('is hidden from a foreign Trader in the same City, and from anyone signed out', async () => {
    const { lister, wanter, foreign } = await seedPair();
    await addWant(wanter, { card_id: examplemon });
    const listingId = await list(lister, holofoil, 'NM');

    expect(await matchFor(foreign.client, listingId, wanter.id)).toBeNull();
    const signedOut = await anonClient()
      .from('matches')
      .select('listing_id')
      .eq('listing_id', listingId);
    expect(signedOut.error?.code).toBe('42501');
  });

  /*
   * The two tables behind the view are the server's alone. match_pairs is
   * every Trader's Wants against every Listing, and a match event outlives
   * its pair, so either would tell a Trader what `matches` does not: whose
   * Wants hold what, or that a Want now removed once held this Card.
   */
  it.each([
    [
      'match_pairs',
      (client: Client) => client.from('match_pairs').select('listing_id'),
    ],
    [
      'match_events',
      (client: Client) => client.from('match_events').select('listing_id'),
    ],
  ] as const)(
    'keeps %s from every Trader, even one party to the pair',
    async (_table, read) => {
      const { lister, wanter, foreign } = await seedPair();
      await addWant(wanter, { card_id: examplemon });
      await list(lister, holofoil, 'NM');

      for (const trader of [lister, wanter, foreign]) {
        const { error } = await read(trader.client);
        expect(error?.code).toBe('42501');
      }
    },
  );

  it('never pairs a Want with a Listing of another Card', async () => {
    const { lister, wanter } = await seedPair();
    await addWant(wanter, { card_id: examplemonEx });

    const listingId = await list(lister, holofoil, 'NM');

    expect(await matchFor(wanter.client, listingId, wanter.id)).toBeNull();
    expect(await matchFor(lister.client, listingId, wanter.id)).toBeNull();
  });

  it("never pairs a Trader's Listing with their own Want", async () => {
    const trader = await seedTrader('Both');
    await addWant(trader, { card_id: examplemon });

    const listingId = await list(trader, holofoil, 'NM');

    expect(await matchFor(trader.client, listingId, trader.id)).toBeNull();
  });

  describe('respects the Want narrowing to a Variant', () => {
    it('matches the Variant the Want names', async () => {
      const { lister, wanter } = await seedPair();
      await addWant(wanter, { card_id: examplemon, card_variant_id: holofoil });

      const listingId = await list(lister, holofoil, 'NM');

      expect(
        await matchFor(wanter.client, listingId, wanter.id),
      ).not.toBeNull();
    });

    it('does not match another Variant of the same Card', async () => {
      const { lister, wanter } = await seedPair();
      await addWant(wanter, {
        card_id: examplemon,
        card_variant_id: reverseHolofoil,
      });

      const listingId = await list(lister, holofoil, 'NM');

      expect(await matchFor(wanter.client, listingId, wanter.id)).toBeNull();
    });
  });

  describe('respects the Want narrowing to a minimum Condition', () => {
    it.each<[Condition, Condition]>([
      ['NM', 'LP'],
      ['LP', 'LP'],
      ['LP', 'DMG'],
    ])('matches a %s Copy against a minimum of %s', async (copy, minimum) => {
      const { lister, wanter } = await seedPair();
      await addWant(wanter, { card_id: examplemon, min_condition: minimum });

      const listingId = await list(lister, holofoil, copy);

      expect(
        await matchFor(wanter.client, listingId, wanter.id),
      ).not.toBeNull();
    });

    it.each<[Condition, Condition]>([
      ['LP', 'NM'],
      ['DMG', 'HP'],
    ])(
      'does not match a %s Copy against a minimum of %s',
      async (copy, minimum) => {
        const { lister, wanter } = await seedPair();
        await addWant(wanter, { card_id: examplemon, min_condition: minimum });

        const listingId = await list(lister, holofoil, copy);

        expect(await matchFor(wanter.client, listingId, wanter.id)).toBeNull();
      },
    );

    it('needs both narrowings to hold when a Want sets both', async () => {
      const { lister, wanter } = await seedPair();
      await addWant(wanter, {
        card_id: examplemon,
        card_variant_id: holofoil,
        min_condition: 'NM',
      });

      const rightVariantWorse = await list(lister, holofoil, 'LP');
      const wrongVariantBetter = await list(lister, reverseHolofoil, 'NM');
      const both = await list(lister, holofoil, 'NM');

      expect(
        await matchFor(wanter.client, rightVariantWorse, wanter.id),
      ).toBeNull();
      expect(
        await matchFor(wanter.client, wrongVariantBetter, wanter.id),
      ).toBeNull();
      expect(await matchFor(wanter.client, both, wanter.id)).not.toBeNull();
    });
  });

  describe('never matches an inactive Listing', () => {
    it('drops a Match when its Listing is withdrawn', async () => {
      const { lister, wanter } = await seedPair();
      await addWant(wanter, { card_id: examplemon });
      const listingId = await list(lister, holofoil, 'NM');

      const { error } = await lister.client.rpc('withdraw_listing', {
        listing_id: listingId,
      });
      if (error) throw error;

      expect(await matchFor(wanter.client, listingId, wanter.id)).toBeNull();
      expect(await matchFor(lister.client, listingId, wanter.id)).toBeNull();
    });

    it('drops a Match while its Listing is committed to a Trade', async () => {
      const { lister, wanter } = await seedPair();
      await addWant(wanter, { card_id: examplemon });
      const listingId = await list(lister, holofoil, 'NM');

      await commitToTrade(listingId);

      expect(await matchFor(wanter.client, listingId, wanter.id)).toBeNull();
    });

    it('drops a Match once its Listing is traded', async () => {
      const { lister, wanter } = await seedPair();
      await addWant(wanter, { card_id: examplemon });
      const listingId = await list(lister, holofoil, 'NM');

      await completeTradeFor(listingId);

      expect(await matchFor(wanter.client, listingId, wanter.id)).toBeNull();
    });

    it('does not match a Want added after the Listing was withdrawn', async () => {
      const { lister, wanter } = await seedPair();
      const listingId = await list(lister, holofoil, 'NM');
      const { error } = await lister.client.rpc('withdraw_listing', {
        listing_id: listingId,
      });
      if (error) throw error;

      await addWant(wanter, { card_id: examplemon });

      expect(await matchFor(wanter.client, listingId, wanter.id)).toBeNull();
      expect(await matchEvents(listingId, wanter.id)).toEqual([]);
    });

    it('matches again when a cancelled Trade puts the Listing back', async () => {
      const { lister, wanter } = await seedPair();
      await addWant(wanter, { card_id: examplemon });
      const listingId = await list(lister, holofoil, 'NM');

      await cancelTradeFor(listingId);

      expect(
        await matchFor(wanter.client, listingId, wanter.id),
      ).not.toBeNull();
    });
  });

  describe('never matches across Cities', () => {
    it('does not pair a Want in another City', async () => {
      const [lister, elsewhere] = await Promise.all([
        seedTrader('Lister'),
        seedTrader('Elsewhere', TEST_CITY),
      ]);
      await addWant(elsewhere, { card_id: examplemon });

      const listingId = await list(lister, holofoil, 'NM');

      expect(
        await matchFor(elsewhere.client, listingId, elsewhere.id),
      ).toBeNull();
      expect(await matchFor(lister.client, listingId, elsewhere.id)).toBeNull();
      expect(await matchEvents(listingId, elsewhere.id)).toEqual([]);
    });

    it('pairs them once the wanting Trader moves into the City', async () => {
      const [lister, mover] = await Promise.all([
        seedTrader('Lister'),
        seedTrader('Mover', TEST_CITY),
      ]);
      await addWant(mover, { card_id: examplemon });
      const listingId = await list(lister, holofoil, 'NM');

      await moveTo(mover, ORANGE_COUNTY);

      expect(await matchFor(mover.client, listingId, mover.id)).toMatchObject({
        lister_id: lister.id,
        wanter_id: mover.id,
      });
      expect(await matchEvents(listingId, mover.id)).toHaveLength(1);
    });

    it('drops the Match when either Trader moves away', async () => {
      const { lister, wanter } = await seedPair();
      await addWant(wanter, { card_id: examplemon });
      const listingId = await list(lister, holofoil, 'NM');

      await moveTo(lister, TEST_CITY);

      expect(await matchFor(wanter.client, listingId, wanter.id)).toBeNull();
      expect(await matchFor(lister.client, listingId, wanter.id)).toBeNull();
    });
  });

  describe('records each new pair exactly once', () => {
    it('records one match event for a new pair, dated as both Traders see it', async () => {
      const { lister, wanter } = await seedPair();
      await addWant(wanter, { card_id: examplemon });

      const listingId = await list(lister, holofoil, 'NM');

      const events = await matchEvents(listingId, wanter.id);
      expect(events).toEqual([
        {
          listing_id: listingId,
          lister_id: lister.id,
          wanter_id: wanter.id,
          created_at: expect.any(String) as string,
        },
      ]);
      for (const trader of [lister, wanter]) {
        expect(
          await matchFor(trader.client, listingId, wanter.id),
        ).toMatchObject({ matched_at: events[0]?.created_at });
      }
    });

    it('collapses two overlapping Wants of one Trader into one Match', async () => {
      const { lister, wanter } = await seedPair();
      await addWant(wanter, { card_id: examplemon });
      await addWant(wanter, {
        card_id: examplemon,
        card_variant_id: holofoil,
        min_condition: 'NM',
      });

      const listingId = await list(lister, holofoil, 'NM');

      expect(
        await matchesFor(wanter.client, listingId, wanter.id),
      ).toHaveLength(1);
      expect(await matchEvents(listingId, wanter.id)).toHaveLength(1);
    });

    it('does not duplicate the event when the pair is evaluated again', async () => {
      const { lister, wanter } = await seedPair();
      const wantId = await addWant(wanter, { card_id: examplemon });
      const listingId = await list(lister, holofoil, 'NM');
      const before = await matchEvents(listingId, wanter.id);
      expect(before).toHaveLength(1);

      // Every path that re-evaluates this pair: the Listing coming back from
      // a cancelled Trade, the Trader adding an overlapping Want, removing
      // and re-adding the one that matched, and both Traders re-saving the
      // City they are already in.
      await cancelTradeFor(listingId);
      await addWant(wanter, { card_id: examplemon, min_condition: 'LP' });
      const { error } = await wanter.client.rpc('remove_want', {
        want_id: wantId,
      });
      if (error) throw error;
      await addWant(wanter, { card_id: examplemon });
      await moveTo(wanter, ORANGE_COUNTY);
      await moveTo(lister, ORANGE_COUNTY);

      expect(await matchEvents(listingId, wanter.id)).toEqual(before);
      expect(
        await matchFor(wanter.client, listingId, wanter.id),
      ).not.toBeNull();
    });

    it('records a separate event for each Listing and each wanting Trader', async () => {
      const [lister, first, second] = await Promise.all([
        seedTrader('Lister'),
        seedTrader('First wanter'),
        seedTrader('Second wanter'),
      ]);
      await addWant(first, { card_id: examplemon });
      await addWant(second, { card_id: examplemon });

      const one = await list(lister, holofoil, 'NM');
      const other = await list(lister, reverseHolofoil, 'LP');

      for (const listingId of [one, other]) {
        expect((await matchEvents(listingId)).map((e) => e.wanter_id)).toEqual(
          expect.arrayContaining([first.id, second.id]),
        );
        expect(await matchEvents(listingId, first.id)).toHaveLength(1);
        expect(await matchEvents(listingId, second.id)).toHaveLength(1);
      }
    });

    it('cannot be written by a Trader', async () => {
      const { lister, wanter } = await seedPair();
      const listingId = await list(lister, holofoil, 'NM');

      const insert = await wanter.client.from('match_events').insert({
        listing_id: listingId,
        lister_id: lister.id,
        wanter_id: wanter.id,
      });
      await addWant(wanter, { card_id: examplemon });
      const remove = await wanter.client
        .from('match_events')
        .delete()
        .eq('listing_id', listingId);

      expect(insert.error?.code).toBe('42501');
      expect(remove.error?.code).toBe('42501');
      expect(await matchEvents(listingId, wanter.id)).toHaveLength(1);
    });
  });

  it('matches on the Card the Want names, not on Examplemon alone', async () => {
    const { lister, wanter } = await seedPair();
    await addWant(wanter, { card_id: examplemonEx, min_condition: 'MP' });

    const listingId = await list(lister, exNormal, 'MP');

    expect(await matchFor(wanter.client, listingId, wanter.id)).not.toBeNull();
  });
});

type CatalogCard = {
  id: number;
  card_variants: { id: number; name: string }[];
};

async function readCard(client: Client, productId: number) {
  const { data, error } = await client
    .from('cards')
    .select('id, card_variants (id, name)')
    .eq('tcgplayer_product_id', productId)
    .single();
  if (error) throw error;
  return data;
}

function variantNamed(card: CatalogCard, name: string): number {
  const variant = card.card_variants.find((v) => v.name === name);
  if (!variant) throw new Error(`No ${name} Variant in the seeded Catalog`);
  return variant.id;
}

async function addWant(
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

async function list(
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

/** Re-saves a Trader's profile in a City, the one way a Trader moves. */
async function moveTo(trader: SeededTrader, city: string) {
  const { error } = await trader.client.rpc('set_trader_profile', {
    display_name: trader.displayName,
    city_id: await cityId(trader.client, city),
    attests_adult: true,
  });
  if (error) throw error;
}

/*
 * Every read below names the wanting Trader as well as the Listing. The
 * City holds Wants for Examplemon from every earlier run, so a new Listing
 * of it legitimately matches all of them from the lister's side; the pair a
 * test arranged is the only one it can speak for.
 */

/** Every Match the caller can see between one Listing and one wanting Trader. */
async function matchesFor(client: Client, listingId: string, wanterId: string) {
  const { data, error } = await client
    .from('matches')
    .select('listing_id, lister_id, wanter_id, matched_at')
    .eq('listing_id', listingId)
    .eq('wanter_id', wanterId);
  if (error) throw error;
  return data;
}

/**
 * The Match between a Listing and a wanting Trader, or null. A pair is one
 * Match however many of the Trader's Wants it satisfies, so a second row
 * would itself be the failure.
 */
async function matchFor(client: Client, listingId: string, wanterId: string) {
  const matches = await matchesFor(client, listingId, wanterId);
  expect(matches.length).toBeLessThanOrEqual(1);
  return matches[0] ?? null;
}

/**
 * The match events on a Listing, optionally for one wanting Trader, read as
 * service_role: the notifier's identity (#20), and the only role that may
 * read them at all.
 */
async function matchEvents(listingId: string, wanterId?: string) {
  let query = serviceClient()
    .from('match_events')
    .select('listing_id, lister_id, wanter_id, created_at')
    .eq('listing_id', listingId);
  if (wanterId) query = query.eq('wanter_id', wanterId);
  const { data, error } = await query.order('created_at');
  if (error) throw error;
  return data;
}
