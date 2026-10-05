import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { arrange, makeFounder, verifyTrader } from './arrange.ts';
import {
  addWant,
  anonClient,
  createListing,
  LISTING_PHOTOS_BUCKET,
  seededExamplemon,
  seedTrader,
  serviceClient,
  submitVerification,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * What deleting an account does to the database. The erasure is a trigger
 * on the account's own deletion, so it is the same whoever deletes the
 * account: the `delete_account` edge function, whose own steps are proven
 * at seam 2 (tests/functions/delete-account.test.ts), or a Founder in the
 * Supabase dashboard. Here the account is deleted through the Auth admin
 * API, which is what both of those call.
 *
 * What was the Trader's alone goes. What stays is every Trade they were
 * party to, for the Trader on the other side: a completed one is that
 * Trader's Trade Record, and it reads whole after the deletion exactly as
 * it did before.
 *
 * Everything another Trader can or cannot read is asserted as that Trader.
 * The one exception is the deleted Trader's own rows, which are counted
 * past every policy through the superuser connection: nobody is left who
 * may read them, and the Trader's own session is refused, which is itself
 * asserted here.
 */

const HOUR = 60 * 60 * 1000;

/** Deletes a Trader's account, as the Auth admin API does for any caller. */
async function deleteAccountOf(trader: Pick<SeededTrader, 'id'>) {
  return serviceClient().auth.admin.deleteUser(trader.id);
}

async function hasAccount(traderId: string) {
  const { data } = await serviceClient().auth.admin.getUserById(traderId);
  return data.user !== null;
}

/** A Trader's public profile, as one client reads it; null where it cannot. */
async function readProfile(client: Client, traderId: string) {
  const { data, error } = await client
    .from('traders')
    .select('display_name, city_id, deleted_at')
    .eq('id', traderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function readTrade(client: Client, tradeId: string) {
  const { data, error } = await client
    .from('trades')
    .select('status, cancelled_by, trade_items(listing_id)')
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

async function addToCollection(trader: SeededTrader, cardVariantId: number) {
  const { error } = await trader.client.rpc('add_to_collection', {
    card_variant_id: cardVariantId,
    condition: 'NM',
    quantity: 1,
  });
  if (error) throw error;
}

async function collectionSize(client: Client) {
  const { data, error } = await client.from('collection_entries').select('id');
  if (error) throw error;
  return data.length;
}

/**
 * How many rows each table of a deleted Trader's own data still holds for
 * them, counted past every policy.
 */
async function ownRowsLeft(traderId: string) {
  return arrange(async (sql) => {
    const [counts] = await sql`
      select
        (select count(*)::int from public.trader_private
          where trader_id = ${traderId}) as trader_private,
        (select count(*)::int from public.collection_entries
          where trader_id = ${traderId}) as collection_entries,
        (select count(*)::int from public.wants
          where trader_id = ${traderId}) as wants,
        (select count(*)::int from public.match_events
          where lister_id = ${traderId} or wanter_id = ${traderId}) as match_events,
        (select count(*)::int from public.push_subscriptions
          where trader_id = ${traderId}) as push_subscriptions,
        (select count(*)::int from public.notifications
          where trader_id = ${traderId}) as notifications,
        (select count(*)::int from public.blocks
          where blocker_id = ${traderId} or blocked_id = ${traderId}) as blocks,
        (select count(*)::int from public.verification_requests
          where trader_id = ${traderId}) as verification_requests,
        (select count(*)::int from public.listings
          where trader_id = ${traderId}
            and status in ('active', 'in_trade')) as live_listings`;
    return counts;
  });
}

const NOTHING_LEFT = {
  trader_private: 0,
  collection_entries: 0,
  wants: 0,
  match_events: 0,
  push_subscriptions: 0,
  notifications: 0,
  blocks: 0,
  verification_requests: 0,
  live_listings: 0,
};

// Each test seeds three Traders and walks a Trade to where it needs it,
// which under a full parallel run outlasts vitest's five-second default.
describe('Deleting an account', { timeout: 60_000 }, () => {
  let card: number;
  let holofoil: number;

  beforeAll(async () => {
    ({ card, holofoil } = await seededExamplemon(
      (await seedTrader('Catalog reader')).client,
    ));
  });

  /**
   * The adversarial trio, all three Verified Traders: the
   * actor, whose account will be deleted, the counterparty they trade with,
   * and a foreign Trader party to nothing.
   */
  async function traders() {
    const [actor, counterparty, foreign] = await Promise.all([
      seedTrader(`Actor ${randomUUID().slice(0, 8)}`),
      seedTrader('Counterparty'),
      seedTrader('Foreign'),
    ]);
    await Promise.all(
      [actor, counterparty, foreign].map((trader) => verifyTrader(trader.id)),
    );
    return { actor, counterparty, foreign };
  }

  /** A proposal between two Traders, one Listing from each side. */
  async function proposedTrade(from: SeededTrader, to: SeededTrader) {
    const [offered, asked] = await Promise.all([
      createListing(from, holofoil, 'NM'),
      createListing(to, holofoil, 'NM'),
    ]);
    const { data: tradeId, error } = await from.client.rpc('create_trade', {
      recipient_id: to.id,
      listing_ids: [offered, asked],
    });
    if (error) throw error;
    return { tradeId, offered, asked };
  }

  /** ... which the Trader it was sent to accepted. */
  async function acceptedTrade(from: SeededTrader, to: SeededTrader) {
    const trade = await proposedTrade(from, to);
    const { error } = await to.client.rpc('accept_trade', {
      trade_id: trade.tradeId,
    });
    if (error) throw error;
    return trade;
  }

  /** ... and whose Meetup the two agreed. */
  async function scheduledTrade(from: SeededTrader, to: SeededTrader) {
    const trade = await acceptedTrade(from, to);
    const { data: spots, error } = await from.client
      .from('safe_spots')
      .select('id');
    if (error) throw error;
    const proposed = await from.client.rpc('propose_meetup', {
      trade_id: trade.tradeId,
      meetup_at: new Date(Date.now() + 24 * HOUR).toISOString(),
      safe_spot_id: spots[0].id,
    });
    if (proposed.error) throw proposed.error;
    const confirmed = await to.client.rpc('confirm_meetup', {
      trade_id: trade.tradeId,
    });
    if (confirmed.error) throw confirmed.error;
    return trade;
  }

  /** ... which both said something on, and both tapped Complete on. */
  async function completedTrade(from: SeededTrader, to: SeededTrader) {
    const trade = await scheduledTrade(from, to);
    for (const trader of [from, to]) {
      const said = await trader.client.rpc('send_message', {
        trade_id: trade.tradeId,
        body: `See you there, from ${trader.displayName}`,
      });
      if (said.error) throw said.error;
    }
    for (const trader of [from, to]) {
      const { error } = await trader.client.rpc('complete_trade', {
        trade_id: trade.tradeId,
      });
      if (error) throw error;
    }
    return trade;
  }

  describe('what was the Trader’s alone', () => {
    it('deletes every row of it with the account', async () => {
      // Not a Verified Trader, so that they have a request waiting.
      const [actor, counterparty] = await Promise.all([
        seedTrader('Actor'),
        seedTrader('Counterparty'),
      ]);
      // Something of everything a Trader holds: a Copy in their Collection,
      // a Want, a Match the counterparty's Listing then makes with it and
      // the alert that goes with one, a push subscription, a block, and a
      // verification request.
      await addToCollection(actor, holofoil);
      await addWant(actor, { card_id: card });
      await createListing(counterparty, holofoil, 'NM');
      const subscribed = await actor.client.rpc('save_push_subscription', {
        endpoint: `https://push.example.test/${randomUUID()}`,
        p256dh: 'key',
        auth: 'secret',
      });
      if (subscribed.error) throw subscribed.error;
      const blocked = await counterparty.client.rpc('block_trader', {
        trader_id: actor.id,
      });
      if (blocked.error) throw blocked.error;
      await submitVerification(actor);
      // The City holds this file's other Listings too, so the Want
      // makes more than the one Match; what matters is that each table
      // holds something to delete.
      const before = await ownRowsLeft(actor.id);
      for (const table of Object.keys(NOTHING_LEFT)) {
        if (table === 'live_listings') continue;
        expect(before[table], table).toBeGreaterThan(0);
      }

      const { error } = await deleteAccountOf(actor);

      expect(error).toBeNull();
      expect(await hasAccount(actor.id)).toBe(false);
      expect(await ownRowsLeft(actor.id)).toEqual(NOTHING_LEFT);
    });

    it('withdraws the Trader’s Listings, so nobody in their City sees them', async () => {
      const { actor, counterparty } = await traders();
      const listing = await createListing(actor, holofoil, 'NM');
      expect(await listingStatus(counterparty.client, listing)).toBe('active');

      await deleteAccountOf(actor);

      expect(await listingStatus(counterparty.client, listing)).toBeNull();
      // Withdrawn, which is what hands its photos to the reaper, read as
      // the reaper reads it.
      expect(await listingStatus(serviceClient(), listing)).toBe('withdrawn');
    });

    it('leaves no profile for anyone to read when the Trader was on no Trade', async () => {
      const { actor, counterparty } = await traders();

      await deleteAccountOf(actor);

      expect(await readProfile(counterparty.client, actor.id)).toBeNull();
      expect(
        await readProfile(anonClient(), actor.id).catch(() => null),
      ).toBeNull();
    });

    it('frees the email address for a new account, which is a new Trader', async () => {
      const { actor } = await traders();
      await deleteAccountOf(actor);

      const again = anonClient();
      const { data, error } = await again.auth.signUp({
        email: actor.email,
        password: randomUUID(),
      });

      expect(error).toBeNull();
      expect(data.user?.id).not.toBe(actor.id);
      expect(await readProfile(again, data.user?.id ?? '')).toEqual({
        display_name: null,
        city_id: null,
        deleted_at: null,
      });
    });

    it('leaves every other Trader’s account and data alone', async () => {
      const { actor, counterparty, foreign } = await traders();
      await addToCollection(counterparty, holofoil);

      await deleteAccountOf(actor);

      for (const other of [counterparty, foreign]) {
        expect(await hasAccount(other.id)).toBe(true);
        expect(await readProfile(other.client, other.id)).toMatchObject({
          display_name: other.displayName,
          deleted_at: null,
        });
      }
      expect(await collectionSize(counterparty.client)).toBe(1);
    });
  });

  describe('the Trade Record', () => {
    it('stays readable whole to its other Trader: the Trade, both Listings, their photos, and what was said', async () => {
      const { actor, counterparty } = await traders();
      const { tradeId, offered, asked } = await completedTrade(
        actor,
        counterparty,
      );

      await deleteAccountOf(actor);

      const trade = await readTrade(counterparty.client, tradeId);
      expect(trade?.status).toBe('completed');
      expect(trade?.trade_items.map((item) => item.listing_id).sort()).toEqual(
        [offered, asked].sort(),
      );
      expect(await listingStatus(counterparty.client, offered)).toBe('traded');

      const { data: photos, error } = await counterparty.client
        .from('listing_photos')
        .select('path, thumbnail_path')
        .eq('listing_id', offered);
      if (error) throw error;
      expect(photos).toHaveLength(1);
      for (const path of [photos[0].path, photos[0].thumbnail_path]) {
        const file = await counterparty.client.storage
          .from(LISTING_PHOTOS_BUCKET)
          .download(path);
        expect(file.error).toBeNull();
      }

      const { data: messages } = await counterparty.client
        .from('messages')
        .select('sender_id, body')
        .eq('trade_id', tradeId)
        .order('created_at');
      expect(messages).toEqual([
        {
          sender_id: actor.id,
          body: `See you there, from ${actor.displayName}`,
        },
        {
          sender_id: counterparty.id,
          body: 'See you there, from Counterparty',
        },
      ]);
    });

    it('still names the deleted Trader to its other Trader, and to nobody else', async () => {
      const { actor, counterparty, foreign } = await traders();
      await completedTrade(actor, counterparty);

      await deleteAccountOf(actor);

      const profile = await readProfile(counterparty.client, actor.id);
      expect(profile).toMatchObject({
        display_name: actor.displayName,
        city_id: null,
      });
      expect(profile?.deleted_at).not.toBeNull();
      expect(await readProfile(foreign.client, actor.id)).toBeNull();
      expect(
        await readProfile(anonClient(), actor.id).catch(() => null),
      ).toBeNull();
    });
  });

  describe('Trades still open', () => {
    it('declines a proposal that was waiting on the deleted Trader', async () => {
      const { actor, counterparty } = await traders();
      const { tradeId, offered } = await proposedTrade(counterparty, actor);

      await deleteAccountOf(actor);

      expect(await readTrade(counterparty.client, tradeId)).toMatchObject({
        status: 'declined',
        cancelled_by: null,
      });
      expect(await listingStatus(counterparty.client, offered)).toBe('active');
    });

    it('cancels a proposal the deleted Trader made, in their name', async () => {
      const { actor, counterparty } = await traders();
      const { tradeId } = await proposedTrade(actor, counterparty);

      await deleteAccountOf(actor);

      expect(await readTrade(counterparty.client, tradeId)).toMatchObject({
        status: 'cancelled',
        cancelled_by: actor.id,
      });
    });

    it('cancels a scheduled Trade in their name, and hands the other Trader’s Listing back', async () => {
      const { actor, counterparty } = await traders();
      const { tradeId, offered, asked } = await scheduledTrade(
        counterparty,
        actor,
      );
      expect(await listingStatus(counterparty.client, offered)).toBe(
        'in_trade',
      );

      await deleteAccountOf(actor);

      expect(await readTrade(counterparty.client, tradeId)).toMatchObject({
        status: 'cancelled',
        cancelled_by: actor.id,
      });
      expect(await listingStatus(counterparty.client, offered)).toBe('active');
      // The deleted Trader's own went back to them, and was withdrawn.
      expect(await listingStatus(counterparty.client, asked)).toBeNull();
    });

    it('still names the deleted Trader on a Trade that never completed', async () => {
      // The case the name is kept for: a Trader who takes the cards at the
      // Meetup and deletes the account without tapping Complete.
      const { actor, counterparty } = await traders();
      const { tradeId } = await scheduledTrade(counterparty, actor);
      const tapped = await counterparty.client.rpc('complete_trade', {
        trade_id: tradeId,
      });
      if (tapped.error) throw tapped.error;

      await deleteAccountOf(actor);

      expect(await readProfile(counterparty.client, actor.id)).toMatchObject({
        display_name: actor.displayName,
      });
    });

    it('alerts nobody to a Match with a Listing the deletion hands back', async () => {
      const { actor, counterparty, foreign } = await traders();
      const { asked } = await scheduledTrade(counterparty, actor);
      // Wanted only once the Listing was committed to the Trade, so the
      // pair has never held, and would hold for the first time the moment
      // the cancelled Trade put the Listing back on offer.
      await addWant(foreign, { card_id: card });

      await deleteAccountOf(actor);

      const { data: alerts, error } = await serviceClient()
        .from('notifications')
        .select('id')
        .eq('trader_id', foreign.id)
        .eq('url', `/listings/${asked}`);
      if (error) throw error;
      expect(alerts).toEqual([]);
    });
  });

  describe('who is refused', () => {
    it('refuses a deleted Trader’s session everything, though its token has not expired', async () => {
      const { actor } = await traders();
      await deleteAccountOf(actor);

      const read = await actor.client.from('cities').select('id');
      const profile = await actor.client.rpc('set_trader_profile', {
        display_name: 'Back again',
        city_id: randomUUID(),
        attests_adult: true,
      });
      const collection = await actor.client.rpc('add_to_collection', {
        card_variant_id: holofoil,
        condition: 'NM',
        quantity: 1,
      });

      for (const { error } of [read, profile, collection]) {
        expect(error?.message).toBe('this account has been deleted');
      }
      expect(await ownRowsLeft(actor.id)).toEqual(NOTHING_LEFT);
    });

    it('keeps a Founder’s account, whose membership only a migration removes', async () => {
      const { actor } = await traders();
      await makeFounder(actor.id);
      await addToCollection(actor, holofoil);

      const { error } = await deleteAccountOf(actor);

      expect(error).not.toBeNull();
      expect(await hasAccount(actor.id)).toBe(true);
      expect(await collectionSize(actor.client)).toBe(1);
      expect(await readProfile(actor.client, actor.id)).toMatchObject({
        display_name: actor.displayName,
        deleted_at: null,
      });
    });

    it('keeps a banned Trader’s account, so a ban is not shed by starting over', async () => {
      const { actor } = await traders();
      await addToCollection(actor, holofoil);
      const banned = await serviceClient().auth.admin.updateUserById(actor.id, {
        ban_duration: '876000h',
      });
      if (banned.error) throw banned.error;

      const { error } = await deleteAccountOf(actor);

      expect(error).not.toBeNull();
      expect(await hasAccount(actor.id)).toBe(true);
      // Counted past every policy: the banned Trader's own session is
      // refused.
      expect((await ownRowsLeft(actor.id)).collection_entries).toBe(1);
      const [row] = await arrange(
        (sql) =>
          sql`select deleted_at from public.traders where id = ${actor.id}`,
      );
      expect(row.deleted_at).toBeNull();
    });

    it('lets no Trader ask whether an account can be deleted', async () => {
      const { actor, foreign } = await traders();

      const asked = await foreign.client.rpc('require_deletable_account', {
        trader_id: actor.id,
      });
      const signedOut = await anonClient().rpc('require_deletable_account', {
        trader_id: actor.id,
      });

      expect(asked.error?.code).toBe('42501');
      expect(signedOut.error?.code).toBe('42501');
    });
  });
});
