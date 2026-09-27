import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { arrange, verifyTrader } from './arrange.ts';
import {
  anonClient,
  createListing,
  LISTING_PHOTOS_BUCKET,
  seededExamplemon,
  seedTrader,
  TEST_CITY,
  TINY_WEBP,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * How a Trade ends (ADR-0005). At the Meetup each Trader taps Complete, and
 * the second tap freezes the Trade into its Trade Record; before that,
 * either Trader may cancel, and once the Meetup's time has passed one may
 * report the other absent, which makes it a no-show. All three are terminal.
 *
 * Each is a named RPC (ADR-0001) only the two participants may take. What
 * the endings count on Reputation is #27's; this file proves the facts it
 * will count from.
 */

const HOUR = 60 * 60 * 1000;

const hoursFromNow = (hours: number) =>
  new Date(Date.now() + hours * HOUR).toISOString();

async function complete(by: SeededTrader, tradeId: string) {
  return by.client.rpc('complete_trade', { trade_id: tradeId });
}

async function cancel(by: SeededTrader, tradeId: string) {
  return by.client.rpc('cancel_trade', { trade_id: tradeId });
}

async function markNoShow(by: SeededTrader, tradeId: string) {
  return by.client.rpc('mark_no_show', { trade_id: tradeId });
}

/** How a Trade stands at its end, as one of its Traders reads it. */
async function readEnding(client: Client, tradeId: string) {
  const { data, error } = await client
    .from('trades')
    .select(
      'status, responder_id, proposer_completed_at, recipient_completed_at, completed_at, cancelled_at, cancelled_by, no_show_at, absent_trader_id',
    )
    .eq('id', tradeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function listingStatus(client: Client, listingId: string) {
  const { data, error } = await client
    .from('listings')
    .select('status')
    .eq('id', listingId)
    .maybeSingle();
  if (error) throw error;
  return data?.status ?? null;
}

describe('Ending a Trade', () => {
  let holofoil: number;

  beforeAll(async () => {
    ({ holofoil } = await seededExamplemon(
      (await seedTrader('Catalog reader')).client,
    ));
  });

  /**
   * The adversarial trio in Test City, for the reason
   * tests/db/trades.test.ts gives, with a proposal from the actor to the
   * counterparty, one Listing from each side. The foreign Trader is verified
   * too, so what refuses them is not being party to the Trade.
   */
  async function proposedTrade() {
    const [actor, counterparty, foreign] = await Promise.all([
      seedTrader('Actor', TEST_CITY),
      seedTrader('Counterparty', TEST_CITY),
      seedTrader('Foreign', TEST_CITY),
    ]);
    await Promise.all(
      [actor, counterparty, foreign].map((trader) => verifyTrader(trader.id)),
    );
    const [mine, theirs] = await Promise.all([
      createListing(actor, holofoil, 'NM'),
      createListing(counterparty, holofoil, 'NM'),
    ]);
    const { data: tradeId, error } = await actor.client.rpc('create_trade', {
      recipient_id: counterparty.id,
      listing_ids: [mine, theirs],
    });
    if (error) throw error;
    return { actor, counterparty, foreign, tradeId, mine, theirs };
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
    const { data: spots, error } = await trade.actor.client
      .from('safe_spots')
      .select('id');
    if (error) throw error;
    const proposed = await trade.actor.client.rpc('propose_meetup', {
      trade_id: trade.tradeId,
      meetup_at: hoursFromNow(24),
      safe_spot_id: spots[0].id,
    });
    if (proposed.error) throw proposed.error;
    const confirmed = await trade.counterparty.client.rpc('confirm_meetup', {
      trade_id: trade.tradeId,
    });
    if (confirmed.error) throw confirmed.error;
    return { ...trade, spot: spots[0].id };
  }

  /** ... and whose Meetup time has now come and gone. */
  async function pastMeetup() {
    const trade = await scheduledTrade();
    await arrange(
      (sql) =>
        sql`update public.trades set meetup_at = now() - interval '1 minute'
              where id = ${trade.tradeId}`,
    );
    return trade;
  }

  /** ... which both Traders tapped Complete on. */
  async function completedTrade() {
    const trade = await scheduledTrade();
    for (const trader of [trade.actor, trade.counterparty]) {
      const { error } = await complete(trader, trade.tradeId);
      if (error) throw error;
    }
    return trade;
  }

  describe('completion', () => {
    it('records the first Complete tap as that side’s alone', async () => {
      const { actor, counterparty, tradeId, mine } = await scheduledTrade();

      const { error } = await complete(counterparty, tradeId);

      expect(error).toBeNull();
      const ending = await readEnding(actor.client, tradeId);
      expect(ending).toMatchObject({
        status: 'scheduled',
        proposer_completed_at: null,
        completed_at: null,
      });
      expect(ending?.recipient_completed_at).not.toBeNull();
      expect(await listingStatus(actor.client, mine)).toBe('in_trade');
    });

    it('completes the Trade on the second tap, stamping when', async () => {
      const { actor, counterparty, tradeId, mine, theirs } =
        await scheduledTrade();
      const first = await complete(actor, tradeId);
      if (first.error) throw first.error;
      const before = Date.now();

      const { error } = await complete(counterparty, tradeId);

      expect(error).toBeNull();
      const ending = await readEnding(counterparty.client, tradeId);
      expect(ending?.status).toBe('completed');
      expect(ending?.proposer_completed_at).not.toBeNull();
      expect(ending?.recipient_completed_at).not.toBeNull();
      expect(
        new Date(ending?.completed_at ?? 0).getTime(),
      ).toBeGreaterThanOrEqual(before - 1000);
      expect(await listingStatus(actor.client, mine)).toBe('traded');
      expect(await listingStatus(counterparty.client, theirs)).toBe('traded');
    });

    it('takes one tap from each side, not two from one', async () => {
      const { actor, tradeId } = await scheduledTrade();
      const first = await complete(actor, tradeId);
      if (first.error) throw first.error;

      const { error } = await complete(actor, tradeId);

      expect(error?.code).toBe('22023');
      expect(await readEnding(actor.client, tradeId)).toMatchObject({
        status: 'scheduled',
        recipient_completed_at: null,
      });
    });

    it('waits for a scheduled Meetup', async () => {
      const { actor, counterparty, tradeId } = await acceptedTrade();

      const { error } = await complete(counterparty, tradeId);

      expect(error?.code).toBe('22023');
      expect(await readEnding(actor.client, tradeId)).toMatchObject({
        status: 'accepted',
        recipient_completed_at: null,
      });
    });
  });

  /*
   * The Trade Record is the completed Trade itself, so what makes it a
   * record is that nothing can change it: not its row, its items, its
   * Listings, or their photos, whether a participant writes directly or
   * through any step of the machine.
   */
  describe('the Trade Record', () => {
    it('is readable whole by both Traders, the other side’s Listing and photos too', async () => {
      const { actor, counterparty, tradeId, mine, theirs, spot } =
        await completedTrade();

      for (const [reader, other] of [
        [actor, theirs],
        [counterparty, mine],
      ] as const) {
        const { data, error } = await reader.client
          .from('trades')
          .select(
            'proposer_id, recipient_id, safe_spot_id, scheduled_at, completed_at, trade_items (listing_id, listings (status, listing_photos (path)))',
          )
          .eq('id', tradeId)
          .single();
        expect(error).toBeNull();
        expect(data).toMatchObject({
          proposer_id: actor.id,
          recipient_id: counterparty.id,
          safe_spot_id: spot,
        });
        const item = data?.trade_items.find((i) => i.listing_id === other);
        expect(item?.listings?.status).toBe('traded');
        const photo = item?.listings?.listing_photos[0]?.path ?? '';
        const download = await reader.client.storage
          .from(LISTING_PHOTOS_BUCKET)
          .download(photo);
        expect(download.error).toBeNull();
      }
    });

    it('is not readable by a foreign Trader, nor are its traded Listings', async () => {
      const { foreign, tradeId, mine } = await completedTrade();

      expect(await readEnding(foreign.client, tradeId)).toBeNull();
      expect(await listingStatus(foreign.client, mine)).toBeNull();
    });

    it('cannot be written directly, even by a participant', async () => {
      const { actor, tradeId, mine } = await completedTrade();
      const before = await readEnding(actor.client, tradeId);

      const writes = await Promise.all([
        actor.client
          .from('trades')
          .update({ status: 'cancelled' })
          .eq('id', tradeId),
        actor.client.from('trades').delete().eq('id', tradeId),
        actor.client.from('trade_items').delete().eq('trade_id', tradeId),
        actor.client
          .from('trade_items')
          .insert({ trade_id: tradeId, listing_id: mine }),
        actor.client
          .from('listings')
          .update({ status: 'active' })
          .eq('id', mine),
        actor.client.from('listing_photos').delete().eq('listing_id', mine),
      ]);

      for (const write of writes) expect(write.error?.code).toBe('42501');
      expect(await readEnding(actor.client, tradeId)).toEqual(before);
      expect(await listingStatus(actor.client, mine)).toBe('traded');
    });

    it('keeps its photos even from the Trader who took them', async () => {
      const { actor, mine } = await completedTrade();
      const { data, error } = await actor.client
        .from('listing_photos')
        .select('path')
        .eq('listing_id', mine)
        .single();
      if (error) throw error;
      const bucket = actor.client.storage.from(LISTING_PHOTOS_BUCKET);

      // Storage answers a removal it may not make with an empty success, so
      // what is asserted is the file, not the reply.
      await bucket.remove([data.path]);
      const overwrite = await bucket.upload(data.path, TINY_WEBP, {
        contentType: 'image/webp',
        upsert: true,
      });

      expect(overwrite.error).not.toBeNull();
      const [file] = await arrange(
        (sql) =>
          sql`select updated_at = created_at as untouched from storage.objects
                where bucket_id = 'listing-photos' and name = ${data.path}`,
      );
      expect(file?.untouched).toBe(true);
    });

    it('refuses every step of the machine, and every ending', async () => {
      const { actor, counterparty, tradeId, mine, spot } =
        await completedTrade();
      const before = await readEnding(actor.client, tradeId);

      const steps = await Promise.all([
        complete(actor, tradeId),
        cancel(actor, tradeId),
        cancel(counterparty, tradeId),
        markNoShow(counterparty, tradeId),
        actor.client.rpc('counter_trade', {
          trade_id: tradeId,
          listing_ids: [mine],
          offered_cash_cents: 100,
        }),
        actor.client.rpc('propose_meetup', {
          trade_id: tradeId,
          meetup_at: hoursFromNow(24),
          safe_spot_id: spot,
        }),
        actor.client.rpc('withdraw_listing', { listing_id: mine }),
      ]);

      for (const step of steps) expect(step.error?.code).toBe('22023');
      expect(await readEnding(actor.client, tradeId)).toEqual(before);
      expect(await listingStatus(actor.client, mine)).toBe('traded');
    });
  });

  describe('cancelling', () => {
    it('ends a scheduled Trade for either Trader and releases its Listings', async () => {
      for (const side of ['actor', 'counterparty'] as const) {
        const trade = await scheduledTrade();
        const canceller = trade[side];

        const { error } = await cancel(canceller, trade.tradeId);

        expect(error).toBeNull();
        const ending = await readEnding(trade.actor.client, trade.tradeId);
        expect(ending).toMatchObject({
          status: 'cancelled',
          cancelled_by: canceller.id,
          completed_at: null,
        });
        expect(ending?.cancelled_at).not.toBeNull();
        expect(await listingStatus(trade.actor.client, trade.mine)).toBe(
          'active',
        );
        expect(
          await listingStatus(trade.counterparty.client, trade.theirs),
        ).toBe('active');
      }
    });

    it('ends an accepted Trade, a Meetup waiting on an answer or not', async () => {
      const trade = await acceptedTrade();

      const { error } = await cancel(trade.actor, trade.tradeId);

      expect(error).toBeNull();
      expect(await readEnding(trade.actor.client, trade.tradeId)).toMatchObject(
        { status: 'cancelled', responder_id: null },
      );
      expect(await listingStatus(trade.actor.client, trade.mine)).toBe(
        'active',
      );
    });

    it('works after one Complete tap, from either side', async () => {
      const trade = await scheduledTrade();
      const tapped = await complete(trade.actor, trade.tradeId);
      if (tapped.error) throw tapped.error;

      const { error } = await cancel(trade.actor, trade.tradeId);

      expect(error).toBeNull();
      expect(
        (await readEnding(trade.actor.client, trade.tradeId))?.status,
      ).toBe('cancelled');
    });

    it('withdraws a proposal, by its proposer only, leaving its Listings as they were', async () => {
      const trade = await proposedTrade();

      const byResponder = await cancel(trade.counterparty, trade.tradeId);
      const byProposer = await cancel(trade.actor, trade.tradeId);

      // The Trader a proposal waits on declines it, which Reputation does
      // not count, rather than cancelling it, which it does.
      expect(byResponder.error?.code).toBe('22023');
      expect(byProposer.error).toBeNull();
      expect(await readEnding(trade.actor.client, trade.tradeId)).toMatchObject(
        { status: 'cancelled', cancelled_by: trade.actor.id },
      );
      expect(await listingStatus(trade.actor.client, trade.mine)).toBe(
        'active',
      );
    });

    it('is terminal', async () => {
      const trade = await scheduledTrade();
      const cancelled = await cancel(trade.actor, trade.tradeId);
      if (cancelled.error) throw cancelled.error;
      const before = await readEnding(trade.actor.client, trade.tradeId);

      const steps = await Promise.all([
        cancel(trade.counterparty, trade.tradeId),
        complete(trade.counterparty, trade.tradeId),
        markNoShow(trade.counterparty, trade.tradeId),
      ]);

      for (const step of steps) expect(step.error?.code).toBe('22023');
      expect(await readEnding(trade.actor.client, trade.tradeId)).toEqual(
        before,
      );
    });

    it('leaves a declined Trade declined', async () => {
      const trade = await proposedTrade();
      const declined = await trade.counterparty.client.rpc('decline_trade', {
        trade_id: trade.tradeId,
      });
      if (declined.error) throw declined.error;

      const { error } = await cancel(trade.actor, trade.tradeId);

      expect(error?.code).toBe('22023');
      expect(
        (await readEnding(trade.actor.client, trade.tradeId))?.status,
      ).toBe('declined');
    });
  });

  describe('a no-show', () => {
    it('is reported against the other Trader once the Meetup time has passed', async () => {
      const trade = await pastMeetup();

      const { error } = await markNoShow(trade.counterparty, trade.tradeId);

      expect(error).toBeNull();
      const ending = await readEnding(trade.actor.client, trade.tradeId);
      expect(ending).toMatchObject({
        status: 'no_show',
        absent_trader_id: trade.actor.id,
        cancelled_by: null,
      });
      expect(ending?.no_show_at).not.toBeNull();
      expect(await listingStatus(trade.actor.client, trade.mine)).toBe(
        'active',
      );
      expect(await listingStatus(trade.counterparty.client, trade.theirs)).toBe(
        'active',
      );
    });

    it('cannot be reported before the Meetup time', async () => {
      const trade = await scheduledTrade();

      const { error } = await markNoShow(trade.counterparty, trade.tradeId);

      expect(error?.code).toBe('22023');
      expect(
        (await readEnding(trade.actor.client, trade.tradeId))?.status,
      ).toBe('scheduled');
    });

    it('needs a scheduled Trade', async () => {
      const trade = await acceptedTrade();

      const { error } = await markNoShow(trade.counterparty, trade.tradeId);

      expect(error?.code).toBe('22023');
      expect(
        (await readEnding(trade.actor.client, trade.tradeId))?.status,
      ).toBe('accepted');
    });

    it('cannot be reported by a Trader who has tapped Complete', async () => {
      const trade = await pastMeetup();
      const tapped = await complete(trade.counterparty, trade.tradeId);
      if (tapped.error) throw tapped.error;

      const reported = await markNoShow(trade.counterparty, trade.tradeId);

      // Their own tap says the Meetup happened. The Trader who has not
      // tapped may still report them absent: a tap can be made from
      // anywhere.
      expect(reported.error?.code).toBe('22023');
      const other = await markNoShow(trade.actor, trade.tradeId);
      expect(other.error).toBeNull();
      expect(await readEnding(trade.actor.client, trade.tradeId)).toMatchObject(
        { status: 'no_show', absent_trader_id: trade.counterparty.id },
      );
    });

    it('is terminal', async () => {
      const trade = await pastMeetup();
      const reported = await markNoShow(trade.actor, trade.tradeId);
      if (reported.error) throw reported.error;
      const before = await readEnding(trade.actor.client, trade.tradeId);

      const steps = await Promise.all([
        markNoShow(trade.counterparty, trade.tradeId),
        cancel(trade.counterparty, trade.tradeId),
        complete(trade.counterparty, trade.tradeId),
      ]);

      for (const step of steps) expect(step.error?.code).toBe('22023');
      expect(await readEnding(trade.actor.client, trade.tradeId)).toEqual(
        before,
      );
    });
  });

  describe('a foreign Trader', () => {
    it('can neither complete, cancel, nor report a no-show, even verified', async () => {
      const trade = await pastMeetup();
      const before = await readEnding(trade.actor.client, trade.tradeId);

      const steps = await Promise.all([
        complete(trade.foreign, trade.tradeId),
        cancel(trade.foreign, trade.tradeId),
        markNoShow(trade.foreign, trade.tradeId),
        anonClient().rpc('complete_trade', { trade_id: trade.tradeId }),
        anonClient().rpc('cancel_trade', { trade_id: trade.tradeId }),
        anonClient().rpc('mark_no_show', { trade_id: trade.tradeId }),
      ]);

      for (const step of steps) expect(step.error?.code).toBe('42501');
      expect(await readEnding(trade.actor.client, trade.tradeId)).toEqual(
        before,
      );
    });

    it('is refused a Trade that does not exist the same way', async () => {
      const { foreign } = await proposedTrade();

      const { error } = await cancel(foreign, randomUUID());

      expect(error?.code).toBe('42501');
    });
  });
});
