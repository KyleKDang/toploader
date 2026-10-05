import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { FOR_GOOD } from '../../supabase/functions/_shared/ban-trader.ts';
import { makeFounder, verifyTrader } from './arrange.ts';
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
 * What banning a Trader does to the database. The closing is a trigger on
 * the account's own ban, so it is the same whoever bans the account: the
 * `ban_trader` edge function, whose own steps are proven at seam 2
 * (tests/functions/ban-trader.test.ts), or a Founder in the Supabase
 * dashboard. Here the account is banned through the Auth admin API, which
 * is what both of those call.
 *
 * A banned Trader can no longer act, and their profile says so to every
 * Trader. Everything another Trader can or cannot read is asserted as that
 * Trader; the banned Trader's own Listings are read as service_role, the
 * way the photo reaper reads them, since their own session is refused.
 */

const HOUR = 60 * 60 * 1000;

/** Bans a Trader's account, as the Auth admin API does for any caller. */
async function ban(trader: Pick<SeededTrader, 'id'>, duration = FOR_GOOD) {
  return serviceClient().auth.admin.updateUserById(trader.id, {
    ban_duration: duration,
  });
}

/** When a Trader was banned, as one client reads it; undefined where it cannot. */
async function bannedAt(client: Client, traderId: string) {
  const { data, error } = await client
    .from('traders')
    .select('banned_at')
    .eq('id', traderId)
    .maybeSingle();
  if (error) throw error;
  return data?.banned_at;
}

async function readTrade(client: Client, tradeId: string) {
  const { data, error } = await client
    .from('trades')
    .select('status, cancelled_by')
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

async function isMatch(client: Client, listingId: string, wanterId: string) {
  const { data, error } = await client
    .from('matches')
    .select('listing_id')
    .eq('listing_id', listingId)
    .eq('wanter_id', wanterId);
  if (error) throw error;
  return data.length > 0;
}

// Each test seeds three Traders and walks a Trade to where it needs it,
// which under a full parallel run outlasts vitest's five-second default.
describe('Banning a Trader', { timeout: 60_000 }, () => {
  let card: number;
  let holofoil: number;

  beforeAll(async () => {
    ({ card, holofoil } = await seededExamplemon(
      (await seedTrader('Catalog reader')).client,
    ));
  });

  /**
   * The adversarial trio, all three Verified Traders: the actor, who will be
   * banned, the counterparty they trade with, and a foreign Trader party to
   * nothing.
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

  /** ... whose Meetup the two agreed. */
  async function scheduledTrade(from: SeededTrader, to: SeededTrader) {
    const trade = await proposedTrade(from, to);
    const accepted = await to.client.rpc('accept_trade', {
      trade_id: trade.tradeId,
    });
    if (accepted.error) throw accepted.error;
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

  /** ... and both tapped Complete on. */
  async function completedTrade(from: SeededTrader, to: SeededTrader) {
    const trade = await scheduledTrade(from, to);
    for (const trader of [from, to]) {
      const { error } = await trader.client.rpc('complete_trade', {
        trade_id: trade.tradeId,
      });
      if (error) throw error;
    }
    return trade;
  }

  describe('the public mark', () => {
    it('marks the profile banned to every signed-in Trader', async () => {
      const { actor, counterparty, foreign } = await traders();
      expect(await bannedAt(foreign.client, actor.id)).toBeNull();

      const { error } = await ban(actor);

      expect(error).toBeNull();
      for (const reader of [counterparty, foreign]) {
        expect(await bannedAt(reader.client, actor.id)).not.toBeNull();
      }
    });

    it('marks it on a completed Trade Record, which stays readable whole', async () => {
      const { actor, counterparty } = await traders();
      const { tradeId, offered, asked } = await completedTrade(
        actor,
        counterparty,
      );

      await ban(actor);

      expect(await readTrade(counterparty.client, tradeId)).toMatchObject({
        status: 'completed',
      });
      for (const listing of [offered, asked]) {
        expect(await listingStatus(counterparty.client, listing)).toBe(
          'traded',
        );
      }
      expect(await bannedAt(counterparty.client, actor.id)).not.toBeNull();
    });

    it('is shown to nobody signed out', async () => {
      const { actor } = await traders();
      await ban(actor);

      expect(
        await bannedAt(anonClient(), actor.id).catch(() => undefined),
      ).toBeUndefined();
    });

    it('marks a ban of any length, as the dashboard gives one', async () => {
      const { actor, foreign } = await traders();

      await ban(actor, '24h');

      expect(await bannedAt(foreign.client, actor.id)).not.toBeNull();
    });

    it('keeps the first ban’s time when the account is banned again', async () => {
      const { actor, foreign } = await traders();
      await ban(actor);
      const first = await bannedAt(foreign.client, actor.id);
      expect(first).not.toBeNull();

      const { error } = await ban(actor);

      expect(error).toBeNull();
      expect(await bannedAt(foreign.client, actor.id)).toBe(first);
    });

    it('stays when the ban is lifted in Auth, since the app has no unban', async () => {
      const { actor, foreign } = await traders();
      await ban(actor);

      await ban(actor, 'none');

      expect(await bannedAt(foreign.client, actor.id)).not.toBeNull();
    });
  });

  describe('a banned Trader can no longer act', () => {
    it('refuses their session on every read and RPC, though its token has not expired', async () => {
      const { actor } = await traders();
      const listing = await createListing(actor, holofoil, 'NM');

      await ban(actor);

      const read = await actor.client.from('cities').select('id');
      expect(read.error?.message).toBe('this account has been banned');
      const listed = await actor.client.rpc('create_listing', {
        card_variant_id: holofoil,
        condition: 'NM',
        photos: [],
      });
      expect(listed.error?.message).toBe('this account has been banned');
      const withdrawn = await actor.client.rpc('withdraw_listing', {
        listing_id: listing,
      });
      expect(withdrawn.error?.message).toBe('this account has been banned');
    });

    it('refuses to refresh their session, so it ends with its token', async () => {
      const { actor } = await traders();
      await ban(actor);

      const { error } = await actor.client.auth.refreshSession();

      expect(error?.code).toBe('user_banned');
    });

    it('refuses them a new session from a sign-in code, as the app signs in', async () => {
      const { actor } = await traders();
      await ban(actor);
      // The code the sign-in email would carry, read from Auth rather than
      // from the inbox.
      const { data, error: linkError } =
        await serviceClient().auth.admin.generateLink({
          type: 'magiclink',
          email: actor.email,
        });
      if (linkError) throw linkError;

      const { error } = await anonClient().auth.verifyOtp({
        email: actor.email,
        token: data.properties.email_otp,
        type: 'email',
      });

      expect(error?.code).toBe('user_banned');
    });

    it('leaves every other Trader’s session alone', async () => {
      const { actor, counterparty, foreign } = await traders();

      await ban(actor);

      for (const other of [counterparty, foreign]) {
        const { error } = await other.client.from('cities').select('id');
        expect(error).toBeNull();
        expect(await bannedAt(other.client, other.id)).toBeNull();
      }
    });
  });

  describe('what leaves everyone’s screens', () => {
    it('withdraws the Trader’s Listings, so nobody in their City sees them', async () => {
      const { actor, counterparty } = await traders();
      const listing = await createListing(actor, holofoil, 'NM');
      expect(await listingStatus(counterparty.client, listing)).toBe('active');

      await ban(actor);

      expect(await listingStatus(counterparty.client, listing)).toBeNull();
      expect(await listingStatus(serviceClient(), listing)).toBe('withdrawn');
    });

    it('ends their Matches both ways, and makes no new one', async () => {
      const { actor, counterparty } = await traders();
      await addWant(actor, { card_id: card });
      const theirs = await createListing(counterparty, holofoil, 'NM');
      await addWant(counterparty, { card_id: card });
      const actorListing = await createListing(actor, holofoil, 'NM');
      expect(await isMatch(counterparty.client, theirs, actor.id)).toBe(true);
      expect(
        await isMatch(counterparty.client, actorListing, counterparty.id),
      ).toBe(true);

      await ban(actor);

      expect(await isMatch(counterparty.client, theirs, actor.id)).toBe(false);
      expect(
        await isMatch(counterparty.client, actorListing, counterparty.id),
      ).toBe(false);
      const later = await createListing(counterparty, holofoil, 'LP');
      expect(await isMatch(counterparty.client, later, actor.id)).toBe(false);
    });
  });

  describe('Trades still open', () => {
    it('declines a proposal that was waiting on the banned Trader', async () => {
      const { actor, counterparty } = await traders();
      const { tradeId, offered } = await proposedTrade(counterparty, actor);

      await ban(actor);

      expect(await readTrade(counterparty.client, tradeId)).toMatchObject({
        status: 'declined',
        cancelled_by: null,
      });
      expect(await listingStatus(counterparty.client, offered)).toBe('active');
    });

    it('cancels a scheduled Trade in the banned Trader’s name, and hands the other Trader’s Listing back', async () => {
      const { actor, counterparty } = await traders();
      const { tradeId, asked } = await scheduledTrade(actor, counterparty);

      await ban(actor);

      expect(await readTrade(counterparty.client, tradeId)).toMatchObject({
        status: 'cancelled',
        cancelled_by: actor.id,
      });
      expect(await listingStatus(counterparty.client, asked)).toBe('active');
    });

    it('leaves the foreign Trader’s Trades alone', async () => {
      const { actor, counterparty, foreign } = await traders();
      const { tradeId } = await proposedTrade(counterparty, foreign);

      await ban(actor);

      expect(await readTrade(foreign.client, tradeId)).toMatchObject({
        status: 'proposed',
      });
    });
  });

  describe('who cannot be banned, and who cannot ban', () => {
    it('refuses to ban a Founder, and leaves them as they were', async () => {
      const { actor, foreign } = await traders();
      await makeFounder(actor.id);
      const listing = await createListing(actor, holofoil, 'NM');

      const { error } = await ban(actor);

      expect(error).not.toBeNull();
      expect(await bannedAt(foreign.client, actor.id)).toBeNull();
      expect(await listingStatus(foreign.client, listing)).toBe('active');
      const { data } = await serviceClient().auth.admin.getUserById(actor.id);
      expect(data.user?.banned_until ?? null).toBeNull();
    });

    it('lets no Trader mark another banned, or themselves unbanned', async () => {
      const { actor, foreign } = await traders();
      await ban(foreign);

      const marked = await actor.client
        .from('traders')
        .update({ banned_at: new Date().toISOString() })
        .eq('id', actor.id)
        .select('id');
      expect(marked.data ?? []).toEqual([]);
      const cleared = await actor.client
        .from('traders')
        .update({ banned_at: null })
        .eq('id', foreign.id)
        .select('id');
      expect(cleared.data ?? []).toEqual([]);

      expect(await bannedAt(actor.client, actor.id)).toBeNull();
      expect(await bannedAt(actor.client, foreign.id)).not.toBeNull();
    });

    it('lets no Trader, not even a Founder, ask the ban rules directly', async () => {
      const { actor, foreign } = await traders();
      await makeFounder(actor.id);

      const allowed = await actor.client.rpc('require_ban_allowed', {
        caller_id: actor.id,
        trader_id: foreign.id,
      });
      expect(allowed.error?.code).toBe('42501');
      const bannable = await actor.client.rpc('require_bannable_trader', {
        trader_id: foreign.id,
      });
      expect(bannable.error?.code).toBe('42501');
    });

    it('lets no Trader take another off the market, which a ban and a deletion share', async () => {
      const { actor, counterparty } = await traders();
      await makeFounder(actor.id);
      const { tradeId, offered } = await proposedTrade(counterparty, actor);

      const { error } = await actor.client.rpc('take_off_the_market', {
        trader_id: counterparty.id,
      });

      expect(error?.code).toBe('42501');
      expect(await readTrade(counterparty.client, tradeId)).toMatchObject({
        status: 'proposed',
      });
      expect(await listingStatus(actor.client, offered)).toBe('active');
    });

    it('refuses a ban asked for by a Trader who is not a Founder, or of one who cannot be banned', async () => {
      const { actor, foreign } = await traders();
      const founder = await seedTrader('Founder');
      const other = await seedTrader('Other Founder');
      await Promise.all([makeFounder(founder.id), makeFounder(other.id)]);
      const asked = (founderId: string, traderId: string) =>
        serviceClient().rpc('require_ban_allowed', {
          caller_id: founderId,
          trader_id: traderId,
        });

      expect((await asked(founder.id, foreign.id)).error).toBeNull();
      expect((await asked(actor.id, foreign.id)).error?.code).toBe('42501');
      expect((await asked(founder.id, other.id)).error?.code).toBe('22023');
      expect((await asked(founder.id, randomUUID())).error?.code).toBe('22023');
      await serviceClient().auth.admin.deleteUser(foreign.id);
      expect((await asked(founder.id, foreign.id)).error?.code).toBe('22023');
    });
  });
});
