import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { commitToTrade, verifyTrader } from './arrange.ts';
import {
  anonClient,
  createListing,
  ORANGE_COUNTY,
  seededExamplemon,
  seedTrader,
  TEST_CITY,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * A Trade is the one agreement between two Traders, a single row walking a
 * single state machine (ADR-0005). This file covers its first phase: a
 * Trader proposes Listings from both sides and maybe some cash, and the
 * other accepts, declines, or counters, which flips the ball back.
 *
 * Every step is a named RPC (ADR-0001), sending or accepting needs a
 * Verified Trader, and only the two participants may read or act on it.
 * Verification is arranged directly (tests/db/arrange.ts) until its own
 * flow arrives in #26.
 */

interface Terms {
  listing_ids: string[];
  offered_cash_cents?: number;
  requested_cash_cents?: number;
}

async function propose(
  from: SeededTrader,
  to: SeededTrader,
  terms: Terms,
): Promise<string> {
  const { data, error } = await from.client.rpc('create_trade', {
    recipient_id: to.id,
    ...terms,
  });
  if (error) throw error;
  return data;
}

async function counter(by: SeededTrader, tradeId: string, terms: Terms) {
  return by.client.rpc('counter_trade', { trade_id: tradeId, ...terms });
}

async function accept(by: SeededTrader, tradeId: string) {
  return by.client.rpc('accept_trade', { trade_id: tradeId });
}

async function decline(by: SeededTrader, tradeId: string) {
  return by.client.rpc('decline_trade', { trade_id: tradeId });
}

/** A Trade as one of its Traders reads it, items sorted, or null. */
async function readTrade(client: Client, tradeId: string) {
  const { data, error } = await client
    .from('trades')
    .select(
      'proposer_id, recipient_id, status, responder_id, proposer_cash_cents, recipient_cash_cents, trade_items (listing_id)',
    )
    .eq('id', tradeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { trade_items, ...trade } = data;
  return {
    ...trade,
    listing_ids: trade_items.map((item) => item.listing_id).sort(),
  };
}

async function listingStatus(client: Client, listingId: string) {
  const { data, error } = await client
    .from('listings')
    .select('status')
    .eq('id', listingId)
    .single();
  if (error) throw error;
  return data.status;
}

describe('Trades', () => {
  let holofoil: number;

  beforeAll(async () => {
    ({ holofoil } = await seededExamplemon(
      (await seedTrader('Catalog reader')).client,
    ));
  });

  /**
   * The adversarial trio, the first two verified, each of those two with
   * two active Listings to put on the table.
   *
   * They trade in Test City rather than the launch City. Every other suite
   * leaves Wants for Examplemon in Orange County on the stack, so each
   * Listing there becomes a Match, and its notifications, with every one of
   * them; a Trade needs no Match, and this file lists dozens of Copies.
   */
  async function seedTable() {
    const [actor, counterparty, foreign] = await Promise.all([
      seedTrader('Actor', TEST_CITY),
      seedTrader('Counterparty', TEST_CITY),
      seedTrader('Foreign', TEST_CITY),
    ]);
    await Promise.all([verifyTrader(actor.id), verifyTrader(counterparty.id)]);
    const [mine, mine2, theirs, theirs2] = await Promise.all([
      createListing(actor, holofoil, 'NM'),
      createListing(actor, holofoil, 'LP'),
      createListing(counterparty, holofoil, 'NM'),
      createListing(counterparty, holofoil, 'MP'),
    ]);
    return { actor, counterparty, foreign, mine, mine2, theirs, theirs2 };
  }

  describe('a proposal', () => {
    it('puts Listings from both sides on the table, waiting on the recipient', async () => {
      const { actor, counterparty, mine, theirs } = await seedTable();

      const tradeId = await propose(actor, counterparty, {
        listing_ids: [mine, theirs],
      });

      const expected = {
        proposer_id: actor.id,
        recipient_id: counterparty.id,
        status: 'proposed',
        responder_id: counterparty.id,
        proposer_cash_cents: null,
        recipient_cash_cents: null,
        listing_ids: [mine, theirs].sort(),
      };
      expect(await readTrade(actor.client, tradeId)).toEqual(expected);
      expect(await readTrade(counterparty.client, tradeId)).toEqual(expected);
      // Proposing commits nothing: the Listings stay on offer until a
      // proposal is accepted.
      expect(await listingStatus(actor.client, mine)).toBe('active');
      expect(await listingStatus(actor.client, theirs)).toBe('active');
    });

    /*
     * Cash is a number two Traders agree on and hand over in person
     * (ADR-0004). It sits on the Trade as a figure on one side and is never
     * anything more: there is no payment, no balance, and no table for one.
     */
    it('may carry cash on either side, as a figure and nothing more', async () => {
      const { actor, counterparty, mine, theirs, theirs2 } = await seedTable();

      const buying = await propose(actor, counterparty, {
        listing_ids: [theirs],
        offered_cash_cents: 12_500,
      });
      const selling = await propose(actor, counterparty, {
        listing_ids: [mine, theirs2],
        requested_cash_cents: 4_000,
      });

      expect(await readTrade(actor.client, buying)).toMatchObject({
        proposer_cash_cents: 12_500,
        recipient_cash_cents: null,
      });
      expect(await readTrade(actor.client, selling)).toMatchObject({
        proposer_cash_cents: null,
        recipient_cash_cents: 4_000,
      });
    });

    it.each<[string, (t: Awaited<ReturnType<typeof seedTable>>) => Terms]>([
      [
        'no Listings at all',
        () => ({ listing_ids: [], offered_cash_cents: 500 }),
      ],
      ['nothing from the recipient', ({ mine }) => ({ listing_ids: [mine] })],
      [
        'nothing from the proposer',
        ({ theirs }) => ({ listing_ids: [theirs] }),
      ],
      [
        'cash on both sides',
        ({ mine, theirs }) => ({
          listing_ids: [mine, theirs],
          offered_cash_cents: 500,
          requested_cash_cents: 500,
        }),
      ],
      [
        'a cash amount of zero',
        ({ mine, theirs }) => ({
          listing_ids: [mine, theirs],
          offered_cash_cents: 0,
        }),
      ],
      [
        'the same Listing twice',
        ({ mine, theirs }) => ({ listing_ids: [mine, theirs, theirs] }),
      ],
      [
        'a Listing that does not exist',
        ({ mine }) => ({ listing_ids: [mine, randomUUID()] }),
      ],
    ])('is refused with %s', async (_case, terms) => {
      const table = await seedTable();

      const { error } = await table.actor.client.rpc('create_trade', {
        recipient_id: table.counterparty.id,
        ...terms(table),
      });

      expect(error?.code).toBe('22023');
    });

    it("is refused with a third Trader's Listing", async () => {
      const { actor, counterparty, foreign, mine } = await seedTable();
      const foreignListing = await createListing(foreign, holofoil, 'NM');

      const { error } = await actor.client.rpc('create_trade', {
        recipient_id: counterparty.id,
        listing_ids: [mine, foreignListing],
      });

      expect(error?.code).toBe('22023');
    });

    it('is refused with a Listing no longer on offer', async () => {
      const { actor, counterparty, mine, theirs, theirs2 } = await seedTable();
      await commitToTrade(theirs);
      const withdrawn = await counterparty.client.rpc('withdraw_listing', {
        listing_id: theirs2,
      });
      if (withdrawn.error) throw withdrawn.error;

      for (const listing of [theirs, theirs2]) {
        const { error } = await actor.client.rpc('create_trade', {
          recipient_id: counterparty.id,
          listing_ids: [mine, listing],
        });
        expect(error?.code).toBe('22023');
      }
    });

    it('cannot be sent to yourself, or to a Trader in another City', async () => {
      const { actor, mine, mine2 } = await seedTable();
      const elsewhere = await seedTrader('Elsewhere', ORANGE_COUNTY);
      await verifyTrader(elsewhere.id);
      const theirs = await createListing(elsewhere, holofoil, 'NM');

      const toSelf = await actor.client.rpc('create_trade', {
        recipient_id: actor.id,
        listing_ids: [mine, mine2],
      });
      const toElsewhere = await actor.client.rpc('create_trade', {
        recipient_id: elsewhere.id,
        listing_ids: [mine, theirs],
      });

      expect(toSelf.error?.code).toBe('22023');
      expect(toElsewhere.error?.code).toBe('22023');
    });
  });

  describe('the recipient', () => {
    it('accepts, which commits every Listing on the table to the Trade', async () => {
      const { actor, counterparty, mine, theirs } = await seedTable();
      const tradeId = await propose(actor, counterparty, {
        listing_ids: [mine, theirs],
      });

      const { error } = await accept(counterparty, tradeId);

      expect(error).toBeNull();
      expect(await readTrade(actor.client, tradeId)).toMatchObject({
        status: 'accepted',
        responder_id: null,
      });
      expect(await listingStatus(actor.client, mine)).toBe('in_trade');
      expect(await listingStatus(actor.client, theirs)).toBe('in_trade');
    });

    it('declines, which ends the Trade and leaves the Listings on offer', async () => {
      const { actor, counterparty, mine, theirs } = await seedTable();
      const tradeId = await propose(actor, counterparty, {
        listing_ids: [mine, theirs],
      });

      const { error } = await decline(counterparty, tradeId);

      expect(error).toBeNull();
      expect(await readTrade(counterparty.client, tradeId)).toMatchObject({
        status: 'declined',
        responder_id: null,
      });
      expect(await listingStatus(actor.client, mine)).toBe('active');
      expect(await listingStatus(actor.client, theirs)).toBe('active');
    });

    it('counters, which replaces both item sets and hands the answer back', async () => {
      const { actor, counterparty, mine, mine2, theirs, theirs2 } =
        await seedTable();
      const tradeId = await propose(actor, counterparty, {
        listing_ids: [mine, theirs],
        offered_cash_cents: 2_000,
      });

      // The counter is written from the countering Trader's side: what they
      // offer and what they ask for.
      const countered = await counter(counterparty, tradeId, {
        listing_ids: [mine, mine2, theirs2],
        offered_cash_cents: 1_500,
      });

      expect(countered.error).toBeNull();
      expect(await readTrade(actor.client, tradeId)).toEqual({
        proposer_id: actor.id,
        recipient_id: counterparty.id,
        status: 'proposed',
        responder_id: actor.id,
        proposer_cash_cents: null,
        recipient_cash_cents: 1_500,
        listing_ids: [mine, mine2, theirs2].sort(),
      });

      // And the ball is now the proposer's: they may counter back, and then
      // it is the recipient's again.
      const back = await counter(actor, tradeId, {
        listing_ids: [mine, theirs2],
      });
      expect(back.error).toBeNull();
      expect(await readTrade(actor.client, tradeId)).toMatchObject({
        responder_id: counterparty.id,
        proposer_cash_cents: null,
        recipient_cash_cents: null,
        listing_ids: [mine, theirs2].sort(),
      });

      expect((await accept(counterparty, tradeId)).error).toBeNull();
      expect(await listingStatus(actor.client, mine)).toBe('in_trade');
      expect(await listingStatus(actor.client, theirs2)).toBe('in_trade');
      // What was taken off the table in a counter is left on offer.
      expect(await listingStatus(actor.client, mine2)).toBe('active');
      expect(await listingStatus(actor.client, theirs)).toBe('active');
    });

    it('counters under the same rules a proposal is held to', async () => {
      const { actor, counterparty, mine, theirs } = await seedTable();
      const tradeId = await propose(actor, counterparty, {
        listing_ids: [mine, theirs],
      });

      const { error } = await counter(counterparty, tradeId, {
        listing_ids: [theirs],
      });

      expect(error?.code).toBe('22023');
      expect(await readTrade(actor.client, tradeId)).toMatchObject({
        responder_id: counterparty.id,
        listing_ids: [mine, theirs].sort(),
      });
    });
  });

  describe('invalid transitions', () => {
    it('keep the proposer from answering their own proposal', async () => {
      const { actor, counterparty, mine, theirs } = await seedTable();
      const tradeId = await propose(actor, counterparty, {
        listing_ids: [mine, theirs],
      });

      const accepted = await accept(actor, tradeId);
      const declined = await decline(actor, tradeId);
      const countered = await counter(actor, tradeId, {
        listing_ids: [mine, theirs],
      });

      expect(accepted.error?.code).toBe('22023');
      expect(declined.error?.code).toBe('22023');
      expect(countered.error?.code).toBe('22023');
      expect(await readTrade(actor.client, tradeId)).toMatchObject({
        status: 'proposed',
        responder_id: counterparty.id,
      });
    });

    it.each([
      ['accepted', accept],
      ['declined', decline],
    ] as const)(
      'refuse every answer once a Trade is %s',
      async (status, answer) => {
        const { actor, counterparty, mine, theirs } = await seedTable();
        const tradeId = await propose(actor, counterparty, {
          listing_ids: [mine, theirs],
        });
        const first = await answer(counterparty, tradeId);
        if (first.error) throw first.error;

        for (const by of [actor, counterparty]) {
          expect((await accept(by, tradeId)).error?.code).toBe('22023');
          expect((await decline(by, tradeId)).error?.code).toBe('22023');
          expect(
            (await counter(by, tradeId, { listing_ids: [mine, theirs] })).error
              ?.code,
          ).toBe('22023');
        }
        expect(await readTrade(actor.client, tradeId)).toMatchObject({
          status,
        });
      },
    );

    it('refuse an accept once a Listing on the table is gone, changing nothing', async () => {
      const { actor, counterparty, mine, theirs } = await seedTable();
      const tradeId = await propose(actor, counterparty, {
        listing_ids: [mine, theirs],
      });
      const withdrawn = await actor.client.rpc('withdraw_listing', {
        listing_id: mine,
      });
      if (withdrawn.error) throw withdrawn.error;

      const { error } = await accept(counterparty, tradeId);

      expect(error?.code).toBe('22023');
      expect(await readTrade(actor.client, tradeId)).toMatchObject({
        status: 'proposed',
      });
      expect(await listingStatus(actor.client, theirs)).toBe('active');
    });

    it('refuse a second Trade for a Listing another Trade has taken', async () => {
      const { actor, counterparty, mine, mine2, theirs } = await seedTable();
      const first = await propose(actor, counterparty, {
        listing_ids: [mine, theirs],
      });
      const second = await propose(actor, counterparty, {
        listing_ids: [mine2, theirs],
      });

      const [one, two] = await Promise.all([
        accept(counterparty, first),
        accept(counterparty, second),
      ]);

      // Whichever landed first took the Listing; the other changed nothing.
      expect([one.error, two.error].filter(Boolean)).toHaveLength(1);
      const loser = one.error ? first : second;
      expect(await readTrade(actor.client, loser)).toMatchObject({
        status: 'proposed',
      });
      expect(
        await listingStatus(actor.client, loser === first ? mine : mine2),
      ).toBe('active');
    });
  });

  describe('Verified Traders', () => {
    it('are the only ones who may send a proposal or a counter', async () => {
      const { actor, mine } = await seedTable();
      const unverified = await seedTrader('Unverified', TEST_CITY);
      const theirOwn = await createListing(unverified, holofoil, 'NM');

      const sent = await unverified.client.rpc('create_trade', {
        recipient_id: actor.id,
        listing_ids: [theirOwn, mine],
      });
      expect(sent.error?.code).toBe('42501');
      expect(sent.error?.message).toMatch(/Verified Trader/);

      // A proposal to an unverified Trader is fine; they are simply asked
      // to verify before they can answer it with anything but a no.
      const tradeId = await propose(actor, unverified, {
        listing_ids: [mine, theirOwn],
      });
      const countered = await counter(unverified, tradeId, {
        listing_ids: [mine, theirOwn],
        offered_cash_cents: 100,
      });
      expect(countered.error?.code).toBe('42501');
      expect(countered.error?.message).toMatch(/Verified Trader/);
      expect(await readTrade(actor.client, tradeId)).toMatchObject({
        responder_id: unverified.id,
        proposer_cash_cents: null,
        recipient_cash_cents: null,
      });
    });

    it('are the only ones who may accept, though anyone may decline', async () => {
      const { actor, mine } = await seedTable();
      const unverified = await seedTrader('Unverified', TEST_CITY);
      const theirOwn = await createListing(unverified, holofoil, 'NM');
      const tradeId = await propose(actor, unverified, {
        listing_ids: [mine, theirOwn],
      });
      const other = await propose(actor, unverified, {
        listing_ids: [mine, theirOwn],
        offered_cash_cents: 300,
      });

      const accepted = await accept(unverified, tradeId);
      expect(accepted.error?.code).toBe('42501');
      expect(accepted.error?.message).toMatch(/Verified Trader/);
      expect(await readTrade(actor.client, tradeId)).toMatchObject({
        status: 'proposed',
      });
      expect(await listingStatus(actor.client, mine)).toBe('active');

      expect((await decline(unverified, other)).error).toBeNull();

      // Once verified, the same Trader may accept.
      await verifyTrader(unverified.id);
      expect((await accept(unverified, tradeId)).error).toBeNull();
    });
  });

  describe('a foreign Trader', () => {
    it('can read neither the Trade nor its items', async () => {
      const { actor, counterparty, foreign, mine, theirs } = await seedTable();
      await verifyTrader(foreign.id);
      const tradeId = await propose(actor, counterparty, {
        listing_ids: [mine, theirs],
      });

      expect(await readTrade(foreign.client, tradeId)).toBeNull();
      const items = await foreign.client
        .from('trade_items')
        .select('listing_id')
        .eq('trade_id', tradeId);
      expect(items.error).toBeNull();
      expect(items.data).toEqual([]);

      const signedOut = await anonClient()
        .from('trades')
        .select('id')
        .eq('id', tradeId);
      expect(signedOut.error?.code).toBe('42501');
    });

    it('can neither accept, decline, nor counter it, even verified', async () => {
      const { actor, counterparty, foreign, mine, theirs } = await seedTable();
      await verifyTrader(foreign.id);
      const tradeId = await propose(actor, counterparty, {
        listing_ids: [mine, theirs],
      });

      const accepted = await accept(foreign, tradeId);
      const declined = await decline(foreign, tradeId);
      const countered = await counter(foreign, tradeId, {
        listing_ids: [mine, theirs],
      });
      const signedOut = await anonClient().rpc('accept_trade', {
        trade_id: tradeId,
      });

      expect(accepted.error?.code).toBe('42501');
      expect(declined.error?.code).toBe('42501');
      expect(countered.error?.code).toBe('42501');
      expect(signedOut.error?.code).toBe('42501');
      expect(await readTrade(actor.client, tradeId)).toMatchObject({
        status: 'proposed',
        responder_id: counterparty.id,
        listing_ids: [mine, theirs].sort(),
      });
    });

    it('is told nothing more about a Trade than about one that does not exist', async () => {
      const { actor, counterparty, foreign, mine, theirs } = await seedTable();
      const tradeId = await propose(actor, counterparty, {
        listing_ids: [mine, theirs],
      });

      const real = await accept(foreign, tradeId);
      const missing = await accept(foreign, randomUUID());

      expect(real.error?.code).toBe(missing.error?.code);
      expect(real.error?.message).toBe(missing.error?.message);
    });
  });

  /*
   * The steps the four RPCs share run as their owner and take the Trader
   * they act for as an argument, so a client calling one directly could
   * rewrite any proposal as anyone. No client role may execute them.
   */
  it('keeps the machine’s internal steps from every client', async () => {
    const { actor, counterparty, mine, theirs } = await seedTable();
    const tradeId = await propose(actor, counterparty, {
      listing_ids: [mine, theirs],
    });
    const { data: trade, error } = await actor.client
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();
    if (error) throw error;

    const rewrite = await actor.client.rpc('set_trade_terms', {
      trade,
      author: counterparty.id,
      listing_ids: [theirs],
      offered_cash_cents: 1,
    });
    const lock = await actor.client.rpc('trade_for_participant', {
      trade_id: tradeId,
      caller: counterparty.id,
    });
    const gate = await anonClient().rpc('require_trader', { verified: false });

    expect(rewrite.error?.code).toBe('42501');
    expect(lock.error?.code).toBe('42501');
    expect(gate.error?.code).toBe('42501');
    expect(await readTrade(actor.client, tradeId)).toMatchObject({
      recipient_cash_cents: null,
      listing_ids: [mine, theirs].sort(),
    });
  });

  it('cannot be written directly by anyone, a participant included', async () => {
    const { actor, counterparty, mine, theirs } = await seedTable();
    const tradeId = await propose(actor, counterparty, {
      listing_ids: [mine, theirs],
    });

    for (const trader of [actor, counterparty]) {
      const insert = await trader.client.from('trades').insert({
        proposer_id: trader.id,
        recipient_id: actor.id === trader.id ? counterparty.id : actor.id,
      });
      const update = await trader.client
        .from('trades')
        .update({ status: 'accepted' })
        .eq('id', tradeId);
      const remove = await trader.client
        .from('trades')
        .delete()
        .eq('id', tradeId);
      const addItem = await trader.client
        .from('trade_items')
        .insert({ trade_id: tradeId, listing_id: mine });
      const removeItem = await trader.client
        .from('trade_items')
        .delete()
        .eq('trade_id', tradeId);

      expect(insert.error?.code).toBe('42501');
      expect(update.error?.code).toBe('42501');
      expect(remove.error?.code).toBe('42501');
      expect(addItem.error?.code).toBe('42501');
      expect(removeItem.error?.code).toBe('42501');
    }
    expect(await readTrade(actor.client, tradeId)).toMatchObject({
      status: 'proposed',
      listing_ids: [mine, theirs].sort(),
    });
  });
});
