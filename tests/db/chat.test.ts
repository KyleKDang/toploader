import { randomUUID } from 'node:crypto';
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { verifyTrader } from './arrange.ts';
import {
  anonClient,
  createListing,
  seededExamplemon,
  seedTrader,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * Trade chat: the two Traders of a Trade talking to each other, the only
 * chat in the app. A message is sent through a named RPC (ADR-0001), read
 * through a select only the Trade's two Traders pass, and delivered live
 * over Realtime to the other one, whose subscription is held to the same
 * policy.
 *
 * The push a message sends is the notifier's, proven at seam 2 in
 * tests/functions/notify.test.ts.
 */

async function send(by: SeededTrader, tradeId: string, body: string) {
  return by.client.rpc('send_message', { trade_id: tradeId, body });
}

/** Sends a message a test needs sent, failing loudly where it is refused. */
async function say(by: SeededTrader, tradeId: string, body: string) {
  const { error } = await send(by, tradeId, body);
  if (error) throw error;
}

/** A Trade's messages as one Trader reads them, oldest first. */
async function readMessages(client: Client, tradeId: string) {
  const { data, error } = await client
    .from('messages')
    .select('trade_id, sender_id, body')
    .eq('trade_id', tradeId)
    .order('created_at');
  if (error) throw error;
  return data;
}

interface Delivered {
  trade_id: string;
  sender_id: string;
  body: string;
}

/**
 * A Trader's live feed of new messages, as the app would hold one open,
 * narrowed to one Trade or, for a Trader fishing, not narrowed at all. It
 * resolves once Realtime says the feed is live, not merely joined, so
 * nothing sent after it is missed.
 */
async function listen(trader: SeededTrader, tradeId?: string) {
  const delivered: Delivered[] = [];
  const channel = trader.client.channel(`chat-${randomUUID()}`).on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      ...(tradeId && { filter: `trade_id=eq.${tradeId}` }),
    },
    ({ new: row }) => {
      const { trade_id, sender_id, body } = row as Delivered;
      delivered.push({ trade_id, sender_id, body });
    },
  );
  await new Promise<void>((resolve, reject) => {
    channel.on(
      'system',
      {},
      (payload: { extension?: string; status?: string }) => {
        if (payload.extension !== 'postgres_changes') return;
        if (payload.status === 'ok') resolve();
        else
          reject(
            new Error(`Realtime refused the feed: ${JSON.stringify(payload)}`),
          );
      },
    );
    channel.subscribe((status, error) => {
      if (
        status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
        status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
      ) {
        reject(error ?? new Error(`Realtime channel ${status}`));
      }
    });
  });
  return {
    delivered,
    /** Resolves once `count` messages have arrived. */
    async until(count: number) {
      await expect
        .poll(() => delivered.length, { timeout: 10_000 })
        .toBe(count);
    },
    close: () => trader.client.removeChannel(channel),
  };
}

describe('Trade chat', { timeout: 30_000 }, () => {
  let holofoil: number;

  beforeAll(async () => {
    ({ holofoil } = await seededExamplemon(
      (await seedTrader('Catalog reader')).client,
    ));
  });

  /**
   * The adversarial trio, with a Trade proposed between the first two.
   */
  async function seedTrade() {
    const [actor, counterparty, foreign] = await Promise.all([
      seedTrader('Actor'),
      seedTrader('Counterparty'),
      seedTrader('Foreign'),
    ]);
    await Promise.all([verifyTrader(actor.id), verifyTrader(counterparty.id)]);
    const [mine, theirs] = await Promise.all([
      createListing(actor, holofoil, 'NM'),
      createListing(counterparty, holofoil, 'LP'),
    ]);
    const { data: tradeId, error } = await actor.client.rpc('create_trade', {
      recipient_id: counterparty.id,
      listing_ids: [mine, theirs],
    });
    if (error) throw error;
    return { actor, counterparty, foreign, tradeId };
  }

  it('lets both Traders of a Trade send messages and read the conversation', async () => {
    const { actor, counterparty, tradeId } = await seedTrade();

    expect(
      (await send(actor, tradeId, 'Still have the Examplemon?')).error,
    ).toBeNull();
    expect(
      (await send(counterparty, tradeId, 'Yes, NM as listed.')).error,
    ).toBeNull();

    const expected = [
      {
        trade_id: tradeId,
        sender_id: actor.id,
        body: 'Still have the Examplemon?',
      },
      {
        trade_id: tradeId,
        sender_id: counterparty.id,
        body: 'Yes, NM as listed.',
      },
    ];
    expect(await readMessages(actor.client, tradeId)).toEqual(expected);
    expect(await readMessages(counterparty.client, tradeId)).toEqual(expected);
  });

  it('delivers a message live to the other Trader, and to no one outside the Trade', async () => {
    const { actor, counterparty, foreign, tradeId } = await seedTrade();
    // The foreign Trader's own Trade with the actor, for the barrier below.
    await verifyTrader(foreign.id);
    const [foreignListing, actorListing] = await Promise.all([
      createListing(foreign, holofoil, 'MP'),
      createListing(actor, holofoil, 'HP'),
    ]);
    const { data: foreignTradeId, error } = await foreign.client.rpc(
      'create_trade',
      { recipient_id: actor.id, listing_ids: [foreignListing, actorListing] },
    );
    if (error) throw error;
    const [counterpartyFeed, foreignFeed] = await Promise.all([
      listen(counterparty, tradeId),
      // Fishing: every message on every Trade, narrowed to none.
      listen(foreign),
    ]);

    try {
      await say(actor, tradeId, 'On my way.');
      // Realtime delivers changes to a feed in the order they committed, so
      // once this later message reaches the foreign Trader, the earlier one
      // would have too, had it been going to.
      await say(actor, foreignTradeId, 'Barrier');

      await counterpartyFeed.until(1);
      await foreignFeed.until(1);
      expect(counterpartyFeed.delivered).toEqual([
        { trade_id: tradeId, sender_id: actor.id, body: 'On my way.' },
      ]);
      expect(foreignFeed.delivered).toEqual([
        { trade_id: foreignTradeId, sender_id: actor.id, body: 'Barrier' },
      ]);
    } finally {
      await Promise.all([counterpartyFeed.close(), foreignFeed.close()]);
    }
  });

  it('is closed to a Trader outside the Trade, who can neither read nor send', async () => {
    const { actor, counterparty, foreign, tradeId } = await seedTrade();
    await say(actor, tradeId, 'Meet Saturday?');

    const foreignSend = await send(foreign, tradeId, 'Hi, I have one too');
    const signedOutSend = await send(
      { ...foreign, client: anonClient() },
      tradeId,
      'Hi',
    );

    expect(await readMessages(foreign.client, tradeId)).toEqual([]);
    expect(foreignSend.error?.code).toBe('42501');
    expect(signedOutSend.error?.code).toBe('42501');
    expect(
      (await readMessages(counterparty.client, tradeId)).map((m) => m.body),
    ).toEqual(['Meet Saturday?']);
  });

  it('has no way to message a Trader except on a Trade with them', async () => {
    const { actor, counterparty, tradeId } = await seedTrade();

    // A Trade that does not exist is refused exactly as another Trader's is,
    // so the call cannot be used to find out which Trades exist.
    const noTrade = await send(actor, randomUUID(), 'Hello?');
    // Nor can a message be written around the RPC, to a Trade or without one.
    const direct = await actor.client.from('messages').insert({
      trade_id: tradeId,
      sender_id: actor.id,
      body: 'Around the RPC',
    });
    const posing = await counterparty.client
      .from('messages')
      .insert({ trade_id: tradeId, sender_id: actor.id, body: 'As the actor' });

    expect(noTrade.error?.code).toBe('42501');
    expect(direct.error?.code).toBe('42501');
    expect(posing.error?.code).toBe('42501');
    expect(await readMessages(actor.client, tradeId)).toEqual([]);
  });

  it('refuses a message of only whitespace, or one longer than 2,000 characters', async () => {
    const { actor, tradeId } = await seedTrade();

    const empty = await send(actor, tradeId, '');
    const blank = await send(actor, tradeId, ' \n\t ');
    const unicodeBlank = await send(actor, tradeId, '\u00a0\u3000');
    const tooLong = await send(actor, tradeId, 'a'.repeat(2_001));
    const longest = await send(actor, tradeId, 'a'.repeat(2_000));

    expect(empty.error?.code).toBe('22023');
    expect(blank.error?.code).toBe('22023');
    expect(unicodeBlank.error?.code).toBe('22023');
    expect(tooLong.error?.code).toBe('22023');
    expect(longest.error).toBeNull();
    expect(await readMessages(actor.client, tradeId)).toHaveLength(1);
  });

  it('closes to new messages once the Trade has ended, and keeps what was said', async () => {
    const { actor, counterparty, tradeId } = await seedTrade();
    await say(actor, tradeId, 'Any chance you add cash?');
    const { error } = await counterparty.client.rpc('decline_trade', {
      trade_id: tradeId,
    });
    if (error) throw error;

    const after = await send(actor, tradeId, 'Wait, reconsider?');

    expect(after.error?.code).toBe('22023');
    expect(
      (await readMessages(counterparty.client, tradeId)).map((m) => m.body),
    ).toEqual(['Any chance you add cash?']);
  });

  it('cannot be edited or deleted by anyone', async () => {
    const { actor, counterparty, tradeId } = await seedTrade();
    await say(actor, tradeId, 'As listed.');

    const edit = await counterparty.client
      .from('messages')
      .update({ body: 'Changed' })
      .eq('trade_id', tradeId);
    const remove = await actor.client
      .from('messages')
      .delete()
      .eq('trade_id', tradeId);

    expect(edit.error?.code).toBe('42501');
    expect(remove.error?.code).toBe('42501');
    expect(
      (await readMessages(actor.client, tradeId)).map((m) => m.body),
    ).toEqual(['As listed.']);
  });
});
