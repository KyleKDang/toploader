import type { Sql } from 'postgres';
import { beforeAll, describe, expect, it } from 'vitest';
import { arrangeCity, overlapWrites, type TraderWrite } from './arrange.ts';
import {
  addWant,
  anonClient,
  cityId,
  createListing,
  fileCity,
  seededExamplemon,
  seedTrader,
  serviceClient,
  signUpTrader,
  uploadListingPhoto,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * Matches made by writes that overlap (#107). A Match needs both of its
 * halves, a Listing and a Want, in one City, with no block between their
 * Traders. When the two writes that complete it arrive together, each is in
 * a transaction that cannot see the other's uncommitted half, and neither
 * would record the Match; so writes that can make a Match in the same City
 * take turns, and the one that goes second records it.
 *
 * Every test holds the two transactions open itself (`overlapWrites`), so
 * the overlap is arranged rather than hoped for, and every assertion is
 * made as a signed-in Trader afterwards.
 */

let card: number;
let holofoil: number;

beforeAll(async () => {
  ({ card, holofoil } = await seededExamplemon(
    (await seedTrader('Catalog reader')).client,
  ));
});

/** A Trader listing the Card, as `create_listing` over the wire does. */
async function listing(lister: SeededTrader): Promise<TraderWrite<string>> {
  const photo = await uploadListingPhoto(lister);
  return {
    as: lister,
    write: async (sql: Sql) => {
      const [row] = await sql`
        select public.create_listing(
          card_variant_id => ${holofoil}::integer,
          condition => 'NM',
          photos => ${sql.json([photo])}
        ) as id`;
      return row.id as string;
    },
  };
}

function want(wanter: SeededTrader): TraderWrite<unknown> {
  return {
    as: wanter,
    write: (sql: Sql) =>
      sql`select public.add_want(card_id => ${card}::integer)`,
  };
}

function unblock(by: SeededTrader, trader: SeededTrader): TraderWrite<unknown> {
  return {
    as: by,
    write: (sql: Sql) =>
      sql`select public.unblock_trader(trader_id => ${trader.id}::uuid)`,
  };
}

/** A Trader moving into the file's City. */
async function move(mover: SeededTrader): Promise<TraderWrite<unknown>> {
  const city = await cityId(mover.client, await fileCity());
  return {
    as: mover,
    write: (sql: Sql) =>
      sql`select public.set_trader_profile(
        display_name => ${mover.displayName},
        city_id => ${city}::uuid,
        attests_adult => true
      )`,
  };
}

async function hasMatch(client: Client, listingId: string, wanterId: string) {
  const { data, error } = await client
    .from('matches')
    .select('listing_id')
    .eq('listing_id', listingId)
    .eq('wanter_id', wanterId);
  if (error) throw error;
  return data.length > 0;
}

/** Who the outbox holds an alert for, on one Match's topic. */
async function alertedOn(listingId: string, wanter: SeededTrader) {
  const { data, error } = await serviceClient()
    .from('notifications')
    .select('trader_id')
    .eq('topic', `match:${listingId}:${wanter.id}`);
  if (error) throw error;
  return data.map((row) => row.trader_id).sort();
}

async function expectMatch(
  listingId: string,
  lister: SeededTrader,
  wanter: SeededTrader,
) {
  expect(await hasMatch(lister.client, listingId, wanter.id)).toBe(true);
  expect(await hasMatch(wanter.client, listingId, wanter.id)).toBe(true);
}

describe('Writes that overlap', { timeout: 30_000 }, () => {
  it('take turns through a lock no client can take for itself', async () => {
    const trader = await seedTrader('Foreign');

    for (const client of [trader.client, anonClient()]) {
      const { error } = await client.rpc('take_matching_turn', {
        trader_ids: [trader.id],
        city_ids: [],
      });
      expect(error?.code).toBe('42501');
    }
  });

  describe('a Listing and a Want for its Card', () => {
    it('records the Match once when the Listing is written first', async () => {
      const [lister, wanter] = await Promise.all([
        seedTrader('Lister'),
        seedTrader('Wanter'),
      ]);

      const [listingId] = await overlapWrites(
        await listing(lister),
        want(wanter),
      );

      await expectMatch(listingId, lister, wanter);
      // The Want went second and made the pair hold, so the lister hears.
      expect(await alertedOn(listingId, wanter)).toEqual([lister.id]);
    });

    it('records the Match once when the Want is written first', async () => {
      const [lister, wanter] = await Promise.all([
        seedTrader('Lister'),
        seedTrader('Wanter'),
      ]);

      const [, listingId] = await overlapWrites(
        want(wanter),
        await listing(lister),
      );

      await expectMatch(listingId, lister, wanter);
      expect(await alertedOn(listingId, wanter)).toEqual([wanter.id]);
    });
  });

  describe('an unblock and a Listing the unblocked Trader wants', () => {
    async function blockedPair() {
      const [lister, wanter] = await Promise.all([
        seedTrader('Lister'),
        seedTrader('Wanter'),
      ]);
      const { error } = await wanter.client.rpc('block_trader', {
        trader_id: lister.id,
      });
      if (error) throw error;
      await addWant(wanter, { card_id: card });
      return { lister, wanter };
    }

    it('records the Match once when the unblock is written first', async () => {
      const { lister, wanter } = await blockedPair();

      const [, listingId] = await overlapWrites(
        unblock(wanter, lister),
        await listing(lister),
      );

      await expectMatch(listingId, lister, wanter);
      expect(await alertedOn(listingId, wanter)).toEqual([wanter.id]);
    });

    it('records the Match once when the Listing is written first', async () => {
      const { lister, wanter } = await blockedPair();

      const [listingId] = await overlapWrites(
        await listing(lister),
        unblock(wanter, lister),
      );

      await expectMatch(listingId, lister, wanter);
      // No one's change is what the unblock records, so both hear.
      expect(await alertedOn(listingId, wanter)).toEqual(
        [lister.id, wanter.id].sort(),
      );
    });
  });

  describe('a move into a City and a Listing there', () => {
    /** Overlaps the two in the order asked, and returns the Listing's id. */
    async function overlapMove(
      moved: TraderWrite<unknown>,
      listed: TraderWrite<string>,
      moveFirst: boolean,
    ) {
      return moveFirst
        ? (await overlapWrites(moved, listed))[1]
        : (await overlapWrites(listed, moved))[0];
    }

    it.each([
      ['the move', true],
      ['the Listing', false],
    ])(
      "records the Match with the mover's Want when %s is written first",
      async (_, moveFirst) => {
        const [lister, wanter] = await Promise.all([
          seedTrader('Lister'),
          seedTrader('Wanter', await arrangeCity()),
        ]);
        await addWant(wanter, { card_id: card });

        const listed = await listing(lister);
        const moved = await move(wanter);
        const listingId = await overlapMove(moved, listed, moveFirst);

        await expectMatch(listingId, lister, wanter);
        // Whoever went second made the pair hold, so the other one hears.
        expect(await alertedOn(listingId, wanter)).toEqual([
          moveFirst ? wanter.id : lister.id,
        ]);
      },
    );

    it.each([
      ['the move', true],
      ['the Listing', false],
    ])(
      "records the Match with the mover's own new Listing when %s is written first",
      async (_, moveFirst) => {
        const [lister, wanter] = await Promise.all([
          seedTrader('Lister', await arrangeCity()),
          seedTrader('Wanter'),
        ]);
        await addWant(wanter, { card_id: card });
        // A Listing from before the move, which the move alone records.
        const earlier = await createListing(lister, holofoil, 'LP');

        const listed = await listing(lister);
        const moved = await move(lister);
        const listingId = await overlapMove(moved, listed, moveFirst);

        for (const id of [earlier, listingId]) {
          await expectMatch(id, lister, wanter);
          expect(await alertedOn(id, wanter)).toEqual([wanter.id]);
        }
      },
    );

    it.each([
      ['the move', true],
      ['the Want', false],
    ])(
      "records the Match with a Want for the mover's Listing when %s is written first",
      async (_, moveFirst) => {
        const [lister, wanter] = await Promise.all([
          seedTrader('Lister', await arrangeCity()),
          seedTrader('Wanter'),
        ]);
        const listingId = await createListing(lister, holofoil, 'NM');

        const writes = [await move(lister), want(wanter)];
        if (!moveFirst) writes.reverse();
        await overlapWrites(writes[0], writes[1]);

        await expectMatch(listingId, lister, wanter);
        expect(await alertedOn(listingId, wanter)).toEqual([
          moveFirst ? lister.id : wanter.id,
        ]);
      },
    );

    it.each([
      ['the move', true],
      ['the Want', false],
    ])(
      'records the Match with a Want a Trader adds while first choosing a City, when %s is written first',
      async (_, moveFirst) => {
        const lister = await seedTrader('Lister');
        // Signed up and not yet onboarded: a Trader with no City.
        const wanter = { ...(await signUpTrader()), displayName: 'Wanter' };
        const listingId = await createListing(lister, holofoil, 'NM');

        const writes = [await move(wanter), want(wanter)];
        if (!moveFirst) writes.reverse();
        await overlapWrites(writes[0], writes[1]);

        await expectMatch(listingId, lister, wanter);
        // Both writes are the wanting Trader's, so the lister hears.
        expect(await alertedOn(listingId, wanter)).toEqual([lister.id]);
      },
    );
  });
});
