import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { arrange, arrangeCity, verifyTrader } from './arrange.ts';
import {
  anonClient,
  cityId,
  createListing,
  seededExamplemon,
  seedTrader,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * The Meetup is the scheduled phase of a Trade (ADR-0005): once a proposal
 * is accepted, either Trader puts forward a time and a Safe Spot from the
 * directory, and the other confirms it, which schedules the Trade. Until
 * then the other may put forward a different one, handing the answer back.
 *
 * Both steps are named RPCs (ADR-0001), and only the two participants may
 * take them. Its notifications are proven at seam 2, in
 * tests/functions/notify.test.ts.
 */

const HOUR = 60 * 60 * 1000;

/** A time the given number of hours from now, as the client sends one. */
const hoursFromNow = (hours: number) =>
  new Date(Date.now() + hours * HOUR).toISOString();

async function proposeMeetup(
  by: SeededTrader,
  tradeId: string,
  meetupAt: string,
  safeSpotId: string,
) {
  return by.client.rpc('propose_meetup', {
    trade_id: tradeId,
    meetup_at: meetupAt,
    safe_spot_id: safeSpotId,
  });
}

async function confirmMeetup(by: SeededTrader, tradeId: string) {
  return by.client.rpc('confirm_meetup', { trade_id: tradeId });
}

/** The scheduling side of a Trade, as one of its Traders reads it. */
async function readMeetup(client: Client, tradeId: string) {
  const { data, error } = await client
    .from('trades')
    .select('status, responder_id, meetup_at, safe_spot_id, scheduled_at')
    .eq('id', tradeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    meetup_at: data.meetup_at && new Date(data.meetup_at).toISOString(),
  };
}

/** The Safe Spots a Trader's directory lists: their own City's. */
async function safeSpotIds(client: Client): Promise<string[]> {
  const { data, error } = await client.from('safe_spots').select('id');
  if (error) throw error;
  return data.map((spot) => spot.id);
}

describe('Meetups', () => {
  let holofoil: number;
  /** A City other than the file's, with Safe Spots of its own. */
  let otherCity: string;
  let anotherCitySpot: string;

  beforeAll(async () => {
    otherCity = await arrangeCity();
    const reader = await seedTrader('Catalog reader', otherCity);
    ({ holofoil } = await seededExamplemon(reader.client));
    [anotherCitySpot] = await safeSpotIds(reader.client);
  });

  /**
   * The adversarial trio, with a proposal between the first two
   * that the counterparty has accepted. The foreign Trader is verified too,
   * so what refuses them is not being party to the Trade.
   */
  async function acceptedTrade() {
    const [actor, counterparty, foreign] = await Promise.all([
      seedTrader('Actor'),
      seedTrader('Counterparty'),
      seedTrader('Foreign'),
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
    const accepted = await counterparty.client.rpc('accept_trade', {
      trade_id: tradeId,
    });
    if (accepted.error) throw accepted.error;
    const [spot, otherSpot] = await safeSpotIds(actor.client);
    return { actor, counterparty, foreign, tradeId, spot, otherSpot, mine };
  }

  describe('a Meetup put forward', () => {
    it('by either Trader of an accepted Trade waits on the other', async () => {
      const { actor, counterparty, tradeId, spot } = await acceptedTrade();
      const meetupAt = hoursFromNow(24);

      const { error } = await proposeMeetup(
        counterparty,
        tradeId,
        meetupAt,
        spot,
      );

      expect(error).toBeNull();
      const expected = {
        status: 'accepted',
        responder_id: actor.id,
        meetup_at: meetupAt,
        safe_spot_id: spot,
        scheduled_at: null,
      };
      expect(await readMeetup(actor.client, tradeId)).toEqual(expected);
      expect(await readMeetup(counterparty.client, tradeId)).toEqual(expected);
    });

    it('is confirmed by the other Trader, which schedules the Trade', async () => {
      const { actor, counterparty, tradeId, spot, mine } =
        await acceptedTrade();
      const meetupAt = hoursFromNow(24);
      const proposed = await proposeMeetup(actor, tradeId, meetupAt, spot);
      if (proposed.error) throw proposed.error;

      const { error } = await confirmMeetup(counterparty, tradeId);

      expect(error).toBeNull();
      expect(await readMeetup(actor.client, tradeId)).toEqual({
        status: 'scheduled',
        responder_id: null,
        meetup_at: meetupAt,
        safe_spot_id: spot,
        scheduled_at: expect.any(String) as string,
      });
      // The Listings stay committed to the Trade until it ends (#25).
      const { data: listing } = await actor.client
        .from('listings')
        .select('status')
        .eq('id', mine)
        .single();
      expect(listing?.status).toBe('in_trade');
    });

    it('may be answered with a different one, which hands the answer back', async () => {
      const { actor, counterparty, tradeId, spot, otherSpot } =
        await acceptedTrade();
      const proposed = await proposeMeetup(
        actor,
        tradeId,
        hoursFromNow(24),
        spot,
      );
      if (proposed.error) throw proposed.error;
      const later = hoursFromNow(48);

      const { error } = await proposeMeetup(
        counterparty,
        tradeId,
        later,
        otherSpot,
      );

      expect(error).toBeNull();
      expect(await readMeetup(actor.client, tradeId)).toMatchObject({
        status: 'accepted',
        responder_id: actor.id,
        meetup_at: later,
        safe_spot_id: otherSpot,
      });
      const confirmed = await confirmMeetup(actor, tradeId);
      expect(confirmed.error).toBeNull();
      expect(await readMeetup(actor.client, tradeId)).toMatchObject({
        status: 'scheduled',
        meetup_at: later,
        safe_spot_id: otherSpot,
      });
    });

    /*
     * Only the Trader a Meetup waits on may replace it, so the one they
     * confirm is always the one they were shown.
     */
    it('can be neither changed nor confirmed by the Trader who put it forward', async () => {
      const { actor, counterparty, tradeId, spot, otherSpot } =
        await acceptedTrade();
      const meetupAt = hoursFromNow(24);
      const proposed = await proposeMeetup(actor, tradeId, meetupAt, spot);
      if (proposed.error) throw proposed.error;

      const change = await proposeMeetup(
        actor,
        tradeId,
        hoursFromNow(48),
        otherSpot,
      );
      const confirm = await confirmMeetup(actor, tradeId);

      expect(change.error?.code).toBe('22023');
      expect(confirm.error?.code).toBe('22023');
      expect(await readMeetup(actor.client, tradeId)).toMatchObject({
        status: 'accepted',
        responder_id: counterparty.id,
        meetup_at: meetupAt,
        safe_spot_id: spot,
      });
    });
  });

  describe('scheduling', () => {
    it('is only possible on an accepted Trade', async () => {
      const { actor, counterparty, tradeId, spot } = await acceptedTrade();
      const [mine, theirs] = await Promise.all([
        createListing(actor, holofoil, 'LP'),
        createListing(counterparty, holofoil, 'LP'),
      ]);
      const { data: proposedId, error } = await actor.client.rpc(
        'create_trade',
        { recipient_id: counterparty.id, listing_ids: [mine, theirs] },
      );
      if (error) throw error;
      const scheduled = await proposeMeetup(
        actor,
        tradeId,
        hoursFromNow(24),
        spot,
      );
      if (scheduled.error) throw scheduled.error;
      const confirmed = await confirmMeetup(counterparty, tradeId);
      if (confirmed.error) throw confirmed.error;

      const onProposal = await proposeMeetup(
        counterparty,
        proposedId,
        hoursFromNow(24),
        spot,
      );
      const confirmProposal = await confirmMeetup(counterparty, proposedId);
      const onScheduled = await proposeMeetup(
        actor,
        tradeId,
        hoursFromNow(48),
        spot,
      );
      const confirmScheduled = await confirmMeetup(counterparty, tradeId);

      expect(onProposal.error?.code).toBe('22023');
      expect(confirmProposal.error?.code).toBe('22023');
      expect(onScheduled.error?.code).toBe('22023');
      expect(confirmScheduled.error?.code).toBe('22023');
      expect(await readMeetup(actor.client, proposedId)).toMatchObject({
        status: 'proposed',
        meetup_at: null,
      });
    });

    it('is only possible with a Safe Spot from the directory', async () => {
      const { actor, tradeId } = await acceptedTrade();

      const unknown = await proposeMeetup(
        actor,
        tradeId,
        hoursFromNow(24),
        randomUUID(),
      );
      const anotherCity = await proposeMeetup(
        actor,
        tradeId,
        hoursFromNow(24),
        anotherCitySpot,
      );

      expect(unknown.error?.code).toBe('22023');
      expect(anotherCity.error?.code).toBe('22023');
      expect(await readMeetup(actor.client, tradeId)).toMatchObject({
        responder_id: null,
        meetup_at: null,
        safe_spot_id: null,
      });
    });

    /*
     * A Trader who moves City after accepting shares no directory with the
     * other any more; they cancel (#25) rather than meet somewhere only one
     * of them was offered.
     */
    it('needs a Safe Spot of the City both Traders are in', async () => {
      const { actor, counterparty, tradeId, spot } = await acceptedTrade();
      const moved = await counterparty.client.rpc('set_trader_profile', {
        display_name: counterparty.displayName,
        city_id: await cityId(counterparty.client, otherCity),
        attests_adult: true,
      });
      if (moved.error) throw moved.error;

      const { error } = await proposeMeetup(
        actor,
        tradeId,
        hoursFromNow(24),
        spot,
      );

      expect(error?.code).toBe('22023');
    });

    it('is only possible for a time still to come', async () => {
      const { actor, tradeId, spot } = await acceptedTrade();

      const { error } = await proposeMeetup(
        actor,
        tradeId,
        hoursFromNow(-1),
        spot,
      );

      expect(error?.code).toBe('22023');
      expect(await readMeetup(actor.client, tradeId)).toMatchObject({
        meetup_at: null,
      });
    });
  });

  describe('a Meetup whose time passed unconfirmed', () => {
    /** The actor put one forward, and its time came and went. */
    async function lapsedMeetup() {
      const trade = await acceptedTrade();
      const proposed = await proposeMeetup(
        trade.actor,
        trade.tradeId,
        hoursFromNow(24),
        trade.spot,
      );
      if (proposed.error) throw proposed.error;
      await arrange(
        (sql) =>
          sql`update public.trades set meetup_at = now() - interval '1 minute'
                where id = ${trade.tradeId}`,
      );
      return trade;
    }

    it('can no longer be confirmed', async () => {
      const { actor, counterparty, tradeId } = await lapsedMeetup();

      const { error } = await confirmMeetup(counterparty, tradeId);

      expect(error?.code).toBe('22023');
      expect(await readMeetup(actor.client, tradeId)).toMatchObject({
        status: 'accepted',
        responder_id: counterparty.id,
      });
    });

    it('may be replaced by the Trader who put it forward', async () => {
      const { actor, counterparty, tradeId, otherSpot } = await lapsedMeetup();
      const later = hoursFromNow(24);

      const { error } = await proposeMeetup(actor, tradeId, later, otherSpot);

      expect(error).toBeNull();
      expect(await readMeetup(actor.client, tradeId)).toMatchObject({
        status: 'accepted',
        responder_id: counterparty.id,
        meetup_at: later,
        safe_spot_id: otherSpot,
      });
    });
  });

  describe('a foreign Trader', () => {
    it('can neither put forward nor confirm a Meetup, even verified', async () => {
      const { actor, counterparty, foreign, tradeId, spot } =
        await acceptedTrade();
      const foreignPut = await proposeMeetup(
        foreign,
        tradeId,
        hoursFromNow(24),
        spot,
      );
      const proposed = await proposeMeetup(
        actor,
        tradeId,
        hoursFromNow(24),
        spot,
      );
      if (proposed.error) throw proposed.error;

      const foreignConfirm = await confirmMeetup(foreign, tradeId);
      const signedOutPut = await anonClient().rpc('propose_meetup', {
        trade_id: tradeId,
        meetup_at: hoursFromNow(48),
        safe_spot_id: spot,
      });
      const signedOutConfirm = await anonClient().rpc('confirm_meetup', {
        trade_id: tradeId,
      });

      expect(foreignPut.error?.code).toBe('42501');
      expect(foreignConfirm.error?.code).toBe('42501');
      expect(signedOutPut.error?.code).toBe('42501');
      expect(signedOutConfirm.error?.code).toBe('42501');
      expect(await readMeetup(foreign.client, tradeId)).toBeNull();
      expect(await readMeetup(actor.client, tradeId)).toMatchObject({
        status: 'accepted',
        responder_id: counterparty.id,
      });
    });

    it('is told nothing more about a Trade than about one that does not exist', async () => {
      const { foreign, tradeId } = await acceptedTrade();

      const real = await confirmMeetup(foreign, tradeId);
      const missing = await confirmMeetup(foreign, randomUUID());

      expect(real.error?.code).toBe(missing.error?.code);
      expect(real.error?.message).toBe(missing.error?.message);
    });
  });

  it('cannot be written directly, by a participant or anyone', async () => {
    const { actor, counterparty, tradeId, spot } = await acceptedTrade();

    for (const trader of [actor, counterparty]) {
      const { error } = await trader.client
        .from('trades')
        .update({ meetup_at: hoursFromNow(24), safe_spot_id: spot })
        .eq('id', tradeId);
      expect(error?.code).toBe('42501');
    }
    expect(await readMeetup(actor.client, tradeId)).toMatchObject({
      meetup_at: null,
    });
  });

  /*
   * The reminder sweep runs as its owner on a schedule and queues for every
   * Trader at once, so no client role may run it or its steps.
   */
  it('keeps the reminder sweep and its steps from every client', async () => {
    const { actor, tradeId } = await acceptedTrade();
    const { data: trade, error } = await actor.client
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();
    if (error) throw error;

    const sweep = await actor.client.rpc('queue_meetup_reminders');
    const signedOut = await anonClient().rpc('queue_meetup_reminders');
    // Queues a notification to both Traders of whatever Trade it is handed,
    // with whatever text: a client calling it could message anyone.
    const queue = await actor.client.rpc('queue_meetup_notifications', {
      trade,
      kind: 'meetup_confirmed',
      title: 'Meetup confirmed',
      body_format: 'Anything at all',
      time_format: 'HH',
    });
    // The same to one Trader, whichever it is handed.
    const queueOne = await actor.client.rpc('queue_meetup_notification', {
      trade,
      recipient: actor.id,
      kind: 'meetup_proposed',
      title: 'Meetup proposed',
      body_format: 'Anything at all',
      time_format: 'HH',
    });

    expect(sweep.error?.code).toBe('42501');
    expect(signedOut.error?.code).toBe('42501');
    expect(queue.error?.code).toBe('42501');
    expect(queueOne.error?.code).toBe('42501');
  });
});
