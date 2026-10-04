import { beforeAll, describe, expect, it } from 'vitest';
import { arrange, arrangeCity, verifyTrader } from './arrange.ts';
import {
  addWant,
  anonClient,
  createListing,
  seededExamplemon,
  seedTrader,
  serviceClient,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * Blocking: any Trader can block another, and from then on the two are
 * strangers to each other in both directions, whichever of them blocked.
 * Neither sees the other's Listings or Matches, neither can propose to the
 * other, and nothing on a Trade between them moves forward or gets said.
 *
 * What a block leaves alone is every way a Trade ends. A Trade already open
 * between the two can still be declined, cancelled, completed, or reported
 * a no-show, so nothing is stranded holding Listings, and Reputation still
 * counts what actually happened. A completed Trade Record stays readable
 * whole to both.
 */

const HOUR = 60 * 60 * 1000;

const hoursFromNow = (hours: number) =>
  new Date(Date.now() + hours * HOUR).toISOString();

async function block(by: SeededTrader, trader: SeededTrader) {
  return by.client.rpc('block_trader', { trader_id: trader.id });
}

/** Blocks a Trader a test needs blocked, failing loudly where it is refused. */
async function arrangeBlock(by: SeededTrader, trader: SeededTrader) {
  const { error } = await block(by, trader);
  if (error) throw error;
}

/** The blocks one client can read. */
async function readBlocks(client: Client) {
  const { data, error } = await client
    .from('blocks')
    .select('blocker_id, blocked_id');
  if (error) throw error;
  return data;
}

async function canReadListing(client: Client, listingId: string) {
  const { data, error } = await client
    .from('listings')
    .select('id')
    .eq('id', listingId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/**
 * Whether one client sees the Match of one Listing and one wanting Trader.
 * Narrowed to the pair, because the City holds this file's other Traders,
 * and any of them may want the same Card.
 */
async function hasMatch(client: Client, listingId: string, wanterId: string) {
  const { data, error } = await client
    .from('matches')
    .select('listing_id')
    .eq('listing_id', listingId)
    .eq('wanter_id', wanterId);
  if (error) throw error;
  return data.length > 0;
}

describe('Blocking a Trader', { timeout: 30_000 }, () => {
  let card: number;
  let holofoil: number;

  beforeAll(async () => {
    ({ card, holofoil } = await seededExamplemon(
      (await seedTrader('Catalog reader')).client,
    ));
  });

  /**
   * The adversarial trio, all three verified so that what refuses a
   * proposal is the block and nothing else.
   */
  async function seedTrio() {
    const [actor, counterparty, foreign] = await Promise.all([
      seedTrader('Actor'),
      seedTrader('Counterparty'),
      seedTrader('Foreign'),
    ]);
    await Promise.all(
      [actor, counterparty, foreign].map((trader) => verifyTrader(trader.id)),
    );
    return { actor, counterparty, foreign };
  }

  /** ... with a proposal from the actor to the counterparty. */
  async function proposedTrade() {
    const trio = await seedTrio();
    const [mine, theirs] = await Promise.all([
      createListing(trio.actor, holofoil, 'NM'),
      createListing(trio.counterparty, holofoil, 'NM'),
    ]);
    const { data: tradeId, error } = await trio.actor.client.rpc(
      'create_trade',
      { recipient_id: trio.counterparty.id, listing_ids: [mine, theirs] },
    );
    if (error) throw error;
    return { ...trio, tradeId, mine, theirs };
  }

  /** ... which the counterparty accepted. */
  async function acceptedTrade() {
    const trade = await proposedTrade();
    const { error } = await trade.counterparty.client.rpc('accept_trade', {
      trade_id: trade.tradeId,
    });
    if (error) throw error;
    return trade;
  }

  /** ... and whose Meetup the actor put forward and the counterparty confirmed. */
  async function scheduledTrade() {
    const trade = await acceptedTrade();
    const spot = await safeSpot(trade.actor);
    const proposed = await trade.actor.client.rpc('propose_meetup', {
      trade_id: trade.tradeId,
      meetup_at: hoursFromNow(24),
      safe_spot_id: spot,
    });
    if (proposed.error) throw proposed.error;
    const confirmed = await trade.counterparty.client.rpc('confirm_meetup', {
      trade_id: trade.tradeId,
    });
    if (confirmed.error) throw confirmed.error;
    return trade;
  }

  async function safeSpot(trader: SeededTrader) {
    const { data, error } = await trader.client.from('safe_spots').select('id');
    if (error) throw error;
    return data[0].id;
  }

  describe('the block itself', () => {
    it('is readable by its two Traders and by no one else', async () => {
      const { actor, counterparty, foreign } = await seedTrio();

      await arrangeBlock(actor, counterparty);

      // The blocked Trader could tell anyway, from what vanishes and what is
      // refused; what stays private is who blocks whom among everyone else.
      for (const trader of [actor, counterparty]) {
        expect(await readBlocks(trader.client)).toEqual([
          { blocker_id: actor.id, blocked_id: counterparty.id },
        ]);
      }
      expect(await readBlocks(foreign.client)).toEqual([]);
      const signedOut = await anonClient().from('blocks').select('blocker_id');
      expect(signedOut.error).not.toBeNull();
    });

    it('is harmless to repeat', async () => {
      const { actor, counterparty } = await seedTrio();

      await arrangeBlock(actor, counterparty);
      expect((await block(actor, counterparty)).error).toBeNull();

      expect(await readBlocks(actor.client)).toHaveLength(1);
    });

    it('cannot be made against yourself, a Trader who does not exist, or signed out', async () => {
      const { actor, counterparty } = await seedTrio();

      expect((await block(actor, actor)).error?.code).toBe('22023');
      expect(
        (
          await actor.client.rpc('block_trader', {
            trader_id: '00000000-0000-0000-0000-000000000000',
          })
        ).error?.code,
      ).toBe('22023');
      expect(
        (
          await anonClient().rpc('block_trader', {
            trader_id: counterparty.id,
          })
        ).error,
      ).not.toBeNull();
    });

    it('is written only through the RPC, never directly', async () => {
      const { actor, counterparty, foreign } = await seedTrio();

      // Neither a Trader blocking for themselves nor one forging a block in
      // another's name gets a row in.
      for (const [client, blocker] of [
        [actor.client, actor],
        [foreign.client, actor],
      ] as const) {
        const { error } = await client
          .from('blocks')
          .insert({ blocker_id: blocker.id, blocked_id: counterparty.id });
        expect(error).not.toBeNull();
      }
      expect(await readBlocks(counterparty.client)).toEqual([]);
    });
  });

  describe("hides each Trader's Listings from the other", () => {
    it.each(['blocker', 'blocked'] as const)(
      'whichever of them the %s is',
      async (who) => {
        const { actor, counterparty, foreign } = await seedTrio();
        const [actorListing, counterpartyListing] = await Promise.all([
          createListing(actor, holofoil, 'NM'),
          createListing(counterparty, holofoil, 'NM'),
        ]);
        expect(await canReadListing(actor.client, counterpartyListing)).toBe(
          true,
        );

        if (who === 'blocker') await arrangeBlock(actor, counterparty);
        else await arrangeBlock(counterparty, actor);

        expect(await canReadListing(actor.client, counterpartyListing)).toBe(
          false,
        );
        expect(await canReadListing(counterparty.client, actorListing)).toBe(
          false,
        );
        // Their own Listings stay theirs, and a Trader outside the block
        // still sees both.
        expect(await canReadListing(actor.client, actorListing)).toBe(true);
        expect(await canReadListing(foreign.client, actorListing)).toBe(true);
        expect(await canReadListing(foreign.client, counterpartyListing)).toBe(
          true,
        );
      },
    );

    it('ends the Matches between them, and makes no new ones', async () => {
      const { actor, counterparty, foreign } = await seedTrio();
      await addWant(counterparty, { card_id: card });
      const listing = await createListing(actor, holofoil, 'NM');
      expect(await hasMatch(actor.client, listing, counterparty.id)).toBe(true);

      await arrangeBlock(counterparty, actor);

      expect(await hasMatch(actor.client, listing, counterparty.id)).toBe(
        false,
      );
      expect(
        await hasMatch(counterparty.client, listing, counterparty.id),
      ).toBe(false);

      // A new Listing the blocked Trader wants neither pairs nor alerts,
      // while a Trader outside the block is matched and alerted as ever.
      await addWant(foreign, { card_id: card });
      const later = await createListing(actor, holofoil, 'LP');
      expect(await hasMatch(actor.client, later, foreign.id)).toBe(true);
      expect(await hasMatch(actor.client, later, counterparty.id)).toBe(false);
      // Read as the notifier reads the outbox, per Match topic, as
      // tests/db/notifications.test.ts does.
      const alertsOn = async (wanter: SeededTrader) => {
        const { data, error } = await serviceClient()
          .from('notifications')
          .select('trader_id')
          .eq('topic', `match:${later}:${wanter.id}`);
        if (error) throw error;
        return data;
      };
      expect(await alertsOn(foreign)).toEqual([{ trader_id: foreign.id }]);
      expect(await alertsOn(counterparty)).toEqual([]);
    });
  });

  describe('prevents proposals', () => {
    it.each(['blocker', 'blocked'] as const)(
      'from the %s to the other',
      async (who) => {
        const { actor, counterparty } = await seedTrio();
        const [actorListing, counterpartyListing] = await Promise.all([
          createListing(actor, holofoil, 'NM'),
          createListing(counterparty, holofoil, 'NM'),
        ]);
        await arrangeBlock(actor, counterparty);
        const [from, to] =
          who === 'blocker' ? [actor, counterparty] : [counterparty, actor];

        const { error } = await from.client.rpc('create_trade', {
          recipient_id: to.id,
          listing_ids: [actorListing, counterpartyListing],
        });

        expect(error?.code).toBe('42501');
      },
    );

    it('leaves a proposal already made unable to be countered or accepted, only declined', async () => {
      const { actor, counterparty, tradeId, mine, theirs } =
        await proposedTrade();

      await arrangeBlock(actor, counterparty);

      const countered = await counterparty.client.rpc('counter_trade', {
        trade_id: tradeId,
        listing_ids: [mine, theirs],
        offered_cash_cents: 500,
      });
      expect(countered.error?.code).toBe('42501');
      const accepted = await counterparty.client.rpc('accept_trade', {
        trade_id: tradeId,
      });
      expect(accepted.error?.code).toBe('42501');

      const declined = await counterparty.client.rpc('decline_trade', {
        trade_id: tradeId,
      });
      expect(declined.error).toBeNull();
    });

    it('stops an accepted Trade from scheduling a Meetup, and lets it be cancelled', async () => {
      const { actor, counterparty, tradeId } = await acceptedTrade();
      const spot = await safeSpot(actor);

      await arrangeBlock(counterparty, actor);

      const proposed = await actor.client.rpc('propose_meetup', {
        trade_id: tradeId,
        meetup_at: hoursFromNow(24),
        safe_spot_id: spot,
      });
      expect(proposed.error?.code).toBe('42501');

      const cancelled = await actor.client.rpc('cancel_trade', {
        trade_id: tradeId,
      });
      expect(cancelled.error).toBeNull();
    });

    it('stops a Meetup already put forward from being confirmed', async () => {
      const { actor, counterparty, tradeId } = await acceptedTrade();
      const proposed = await actor.client.rpc('propose_meetup', {
        trade_id: tradeId,
        meetup_at: hoursFromNow(24),
        safe_spot_id: await safeSpot(actor),
      });
      if (proposed.error) throw proposed.error;

      await arrangeBlock(actor, counterparty);

      const confirmed = await counterparty.client.rpc('confirm_meetup', {
        trade_id: tradeId,
      });
      expect(confirmed.error?.code).toBe('42501');
    });

    it('lets a scheduled Trade still be completed, into a Trade Record both can read whole', async () => {
      const { actor, counterparty, tradeId, mine, theirs } =
        await scheduledTrade();

      await arrangeBlock(actor, counterparty);

      // The Trade's Listings stay on its page while it is open.
      expect(await canReadListing(actor.client, theirs)).toBe(true);
      expect(await canReadListing(counterparty.client, mine)).toBe(true);

      for (const trader of [actor, counterparty]) {
        const { error } = await trader.client.rpc('complete_trade', {
          trade_id: tradeId,
        });
        expect(error).toBeNull();
      }

      const { data: trade, error } = await counterparty.client
        .from('trades')
        .select('status')
        .eq('id', tradeId)
        .single();
      if (error) throw error;
      expect(trade.status).toBe('completed');
      expect(await canReadListing(actor.client, theirs)).toBe(true);
      expect(await canReadListing(counterparty.client, mine)).toBe(true);
    });

    it('lets a scheduled Trade whose Meetup has passed still be reported a no-show', async () => {
      const { actor, counterparty, tradeId } = await scheduledTrade();
      await arrangeBlock(counterparty, actor);
      await arrange(
        (sql) =>
          sql`update public.trades set meetup_at = now() - interval '1 minute'
                where id = ${tradeId}`,
      );

      const { error } = await actor.client.rpc('mark_no_show', {
        trade_id: tradeId,
      });

      expect(error).toBeNull();
    });

    it('lets the proposer still withdraw their proposal', async () => {
      const { actor, counterparty, tradeId } = await proposedTrade();
      await arrangeBlock(counterparty, actor);

      const { error } = await actor.client.rpc('cancel_trade', {
        trade_id: tradeId,
      });

      expect(error).toBeNull();
    });
  });

  describe("keeps an open Trade's Listings readable to its two Traders", () => {
    it('and to no Trader outside it', async () => {
      const { actor, counterparty, mine, theirs } = await proposedTrade();
      // Another City, so City browse cannot be what shows them.
      const outsider = await seedTrader('Outsider', await arrangeCity());
      await arrangeBlock(actor, counterparty);

      expect(await canReadListing(counterparty.client, mine)).toBe(true);
      expect(await canReadListing(actor.client, theirs)).toBe(true);
      expect(await canReadListing(outsider.client, mine)).toBe(false);
      expect(await canReadListing(outsider.client, theirs)).toBe(false);
    });

    it('but not once its Trader withdraws it from under the proposal', async () => {
      const { actor, counterparty, theirs } = await proposedTrade();
      await arrangeBlock(actor, counterparty);

      const { error } = await counterparty.client.rpc('withdraw_listing', {
        listing_id: theirs,
      });
      if (error) throw error;

      expect(await canReadListing(actor.client, theirs)).toBe(false);
      expect(await canReadListing(counterparty.client, theirs)).toBe(true);
    });
  });

  describe('prevents chat', () => {
    it.each(['blocker', 'blocked'] as const)(
      'from the %s, leaving what was said readable',
      async (who) => {
        const { actor, counterparty, tradeId } = await proposedTrade();
        const said = await actor.client.rpc('send_message', {
          trade_id: tradeId,
          body: 'Still have it?',
        });
        if (said.error) throw said.error;

        await arrangeBlock(actor, counterparty);
        const from = who === 'blocker' ? actor : counterparty;

        const { error } = await from.client.rpc('send_message', {
          trade_id: tradeId,
          body: 'Hello?',
        });
        expect(error?.code).toBe('42501');

        for (const trader of [actor, counterparty]) {
          const { data, error: readError } = await trader.client
            .from('messages')
            .select('body')
            .eq('trade_id', tradeId);
          if (readError) throw readError;
          expect(data).toEqual([{ body: 'Still have it?' }]);
        }
      },
    );
  });

  it('leaves Trades with anyone else untouched', async () => {
    const { actor, counterparty, foreign } = await seedTrio();
    await arrangeBlock(actor, counterparty);
    const [mine, theirs] = await Promise.all([
      createListing(actor, holofoil, 'NM'),
      createListing(foreign, holofoil, 'NM'),
    ]);

    const { data: tradeId, error } = await actor.client.rpc('create_trade', {
      recipient_id: foreign.id,
      listing_ids: [mine, theirs],
    });
    expect(error).toBeNull();
    const said = await foreign.client.rpc('send_message', {
      trade_id: tradeId!,
      body: 'Deal.',
    });
    expect(said.error).toBeNull();
  });
});

/*
 * Unblocking (#87): a Trader takes back a block they made, and what the
 * block took away comes back in both directions, unless the other Trader
 * holds a block of their own. A Match that first held while the block stood
 * was never seen by either Trader, so it alerts both as a new one.
 */
describe('Unblocking a Trader', { timeout: 30_000 }, () => {
  let card: number;
  let holofoil: number;

  beforeAll(async () => {
    ({ card, holofoil } = await seededExamplemon(
      (await seedTrader('Catalog reader')).client,
    ));
  });

  async function seedTrio() {
    const [actor, counterparty, foreign] = await Promise.all([
      seedTrader('Actor'),
      seedTrader('Counterparty'),
      seedTrader('Foreign'),
    ]);
    await Promise.all(
      [actor, counterparty, foreign].map((trader) => verifyTrader(trader.id)),
    );
    return { actor, counterparty, foreign };
  }

  async function unblock(by: SeededTrader, trader: SeededTrader) {
    return by.client.rpc('unblock_trader', { trader_id: trader.id });
  }

  async function arrangeUnblock(by: SeededTrader, trader: SeededTrader) {
    const { error } = await unblock(by, trader);
    if (error) throw error;
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

  describe('the unblock itself', () => {
    it("removes only the caller's own block", async () => {
      const { actor, counterparty } = await seedTrio();
      await arrangeBlock(actor, counterparty);
      await arrangeBlock(counterparty, actor);

      await arrangeUnblock(actor, counterparty);

      expect(await readBlocks(actor.client)).toEqual([
        { blocker_id: counterparty.id, blocked_id: actor.id },
      ]);
    });

    it('cannot be done by the blocked Trader, a foreign Trader, or signed out', async () => {
      const { actor, counterparty, foreign } = await seedTrio();
      await arrangeBlock(actor, counterparty);

      // Neither has a block of their own to take back, so each call is a
      // no-op on their own account, never on the actor's.
      await arrangeUnblock(counterparty, actor);
      await arrangeUnblock(foreign, counterparty);
      const signedOut = await anonClient().rpc('unblock_trader', {
        trader_id: counterparty.id,
      });
      expect(signedOut.error).not.toBeNull();
      // Nor is a block deleted around the RPC, by any of the three.
      for (const trader of [actor, counterparty, foreign]) {
        await trader.client
          .from('blocks')
          .delete()
          .eq('blocker_id', actor.id)
          .eq('blocked_id', counterparty.id);
      }

      expect(await readBlocks(actor.client)).toEqual([
        { blocker_id: actor.id, blocked_id: counterparty.id },
      ]);
    });

    it('changes nothing when the Trader is not blocked', async () => {
      const { actor, counterparty, foreign } = await seedTrio();
      await arrangeBlock(foreign, counterparty);

      expect((await unblock(actor, counterparty)).error).toBeNull();

      expect(await readBlocks(actor.client)).toEqual([]);
      expect(await readBlocks(foreign.client)).toEqual([
        { blocker_id: foreign.id, blocked_id: counterparty.id },
      ]);
    });

    it('cannot name yourself or a Trader who does not exist', async () => {
      const { actor } = await seedTrio();

      expect((await unblock(actor, actor)).error?.code).toBe('22023');
      expect(
        (
          await actor.client.rpc('unblock_trader', {
            trader_id: '00000000-0000-0000-0000-000000000000',
          })
        ).error?.code,
      ).toBe('22023');
    });
  });

  describe('gives back what the block took', () => {
    it.each(['blocker', 'blocked'] as const)(
      "each Trader's Listings, and proposals from the %s",
      async (who) => {
        const { actor, counterparty } = await seedTrio();
        const [actorListing, counterpartyListing] = await Promise.all([
          createListing(actor, holofoil, 'NM'),
          createListing(counterparty, holofoil, 'NM'),
        ]);
        await arrangeBlock(actor, counterparty);

        await arrangeUnblock(actor, counterparty);

        expect(await canReadListing(actor.client, counterpartyListing)).toBe(
          true,
        );
        expect(await canReadListing(counterparty.client, actorListing)).toBe(
          true,
        );
        const [from, to] =
          who === 'blocker' ? [actor, counterparty] : [counterparty, actor];
        const { error } = await from.client.rpc('create_trade', {
          recipient_id: to.id,
          listing_ids: [actorListing, counterpartyListing],
        });
        expect(error).toBeNull();
      },
    );

    it('chat and the steps of a Trade that stood open through the block', async () => {
      const { actor, counterparty } = await seedTrio();
      const [mine, theirs] = await Promise.all([
        createListing(actor, holofoil, 'NM'),
        createListing(counterparty, holofoil, 'NM'),
      ]);
      const { data: tradeId, error } = await actor.client.rpc('create_trade', {
        recipient_id: counterparty.id,
        listing_ids: [mine, theirs],
      });
      if (error) throw error;
      await arrangeBlock(counterparty, actor);

      await arrangeUnblock(counterparty, actor);

      for (const trader of [actor, counterparty]) {
        const said = await trader.client.rpc('send_message', {
          trade_id: tradeId,
          body: 'Still on?',
        });
        expect(said.error).toBeNull();
      }
      const accepted = await counterparty.client.rpc('accept_trade', {
        trade_id: tradeId,
      });
      expect(accepted.error).toBeNull();
    });

    it('a Match that held before the block, without alerting it again', async () => {
      const { actor, counterparty } = await seedTrio();
      await addWant(counterparty, { card_id: card });
      const listing = await createListing(actor, holofoil, 'NM');
      expect(await alertedOn(listing, counterparty)).toEqual([counterparty.id]);
      await arrangeBlock(actor, counterparty);

      await arrangeUnblock(actor, counterparty);

      expect(await hasMatch(actor.client, listing, counterparty.id)).toBe(true);
      expect(
        await hasMatch(counterparty.client, listing, counterparty.id),
      ).toBe(true);
      expect(await alertedOn(listing, counterparty)).toEqual([counterparty.id]);
    });

    it('a Match that first held during the block, alerted to both Traders as new', async () => {
      const { actor, counterparty, foreign } = await seedTrio();
      await arrangeBlock(actor, counterparty);
      await Promise.all([
        addWant(counterparty, { card_id: card }),
        addWant(foreign, { card_id: card }),
      ]);
      const listing = await createListing(actor, holofoil, 'NM');
      expect(await alertedOn(listing, counterparty)).toEqual([]);

      await arrangeUnblock(actor, counterparty);

      expect(await hasMatch(actor.client, listing, counterparty.id)).toBe(true);
      expect(
        await hasMatch(counterparty.client, listing, counterparty.id),
      ).toBe(true);
      expect(await alertedOn(listing, counterparty)).toEqual(
        [actor.id, counterparty.id].sort(),
      );
      // A Match with a Trader outside the block was alerted when it held,
      // and the unblock does not alert it again.
      expect(await alertedOn(listing, foreign)).toEqual([foreign.id]);
    });
  });

  describe('while the other Trader still holds a block', () => {
    it('gives back nothing, and alerts nothing until that block goes too', async () => {
      const { actor, counterparty } = await seedTrio();
      await arrangeBlock(actor, counterparty);
      await arrangeBlock(counterparty, actor);
      await addWant(counterparty, { card_id: card });
      const [listing, counterpartyListing] = await Promise.all([
        createListing(actor, holofoil, 'NM'),
        createListing(counterparty, holofoil, 'NM'),
      ]);

      await arrangeUnblock(actor, counterparty);

      expect(await canReadListing(actor.client, counterpartyListing)).toBe(
        false,
      );
      expect(await hasMatch(actor.client, listing, counterparty.id)).toBe(
        false,
      );
      const proposed = await actor.client.rpc('create_trade', {
        recipient_id: counterparty.id,
        listing_ids: [listing, counterpartyListing],
      });
      expect(proposed.error?.code).toBe('42501');
      expect(await alertedOn(listing, counterparty)).toEqual([]);

      await arrangeUnblock(counterparty, actor);

      expect(await hasMatch(actor.client, listing, counterparty.id)).toBe(true);
      expect(await alertedOn(listing, counterparty)).toEqual(
        [actor.id, counterparty.id].sort(),
      );
    });
  });
});
