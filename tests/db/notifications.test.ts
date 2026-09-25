import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  addWant,
  anonClient,
  createListing,
  EXAMPLEMON,
  seedAdversarialTraders,
  seededCard,
  seedTrader,
  serviceClient,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * Notifications, the database half: where a Trader's push subscriptions live
 * and who may touch them, and the outbox the notifier drains, which no
 * Trader may read at all.
 *
 * The sending itself is the notifier's, proven at seam 2 in
 * tests/functions/notify.test.ts.
 */

/** A subscription as a browser hands one over: an endpoint and two keys. */
function subscription() {
  return {
    endpoint: `https://push.example.test/${randomUUID()}`,
    p256dh: 'BPfUo8n8Fixture',
    auth: 'fixtureAuth',
  };
}

async function save(
  trader: SeededTrader,
  sub: ReturnType<typeof subscription>,
) {
  const { error } = await trader.client.rpc('save_push_subscription', sub);
  if (error) throw error;
}

/** The endpoints a client can see, in the order they were saved. */
async function endpointsSeenBy(client: Client) {
  const { data, error } = await client
    .from('push_subscriptions')
    .select('endpoint')
    .order('created_at');
  if (error) throw error;
  return data.map((row) => row.endpoint);
}

describe('Push subscriptions', () => {
  it('are saved to the calling Trader, who reads only their own', async () => {
    const { actor, foreign } = await seedAdversarialTraders();
    const mine = subscription();
    const theirs = subscription();
    await save(actor, mine);
    await save(foreign, theirs);

    expect(await endpointsSeenBy(actor.client)).toEqual([mine.endpoint]);
    expect(await endpointsSeenBy(foreign.client)).toEqual([theirs.endpoint]);
  });

  it('follow the browser to whoever signs in on it next', async () => {
    // One browser has one subscription, whichever Trader is signed in, so a
    // second Trader saving the same endpoint takes it over rather than
    // leaving the first Trader's notifications arriving on it.
    const { actor, counterparty } = await seedAdversarialTraders();
    const shared = subscription();
    await save(actor, shared);

    await save(counterparty, { ...shared, auth: 'rotatedAuth' });

    expect(await endpointsSeenBy(actor.client)).toEqual([]);
    expect(await endpointsSeenBy(counterparty.client)).toEqual([
      shared.endpoint,
    ]);
  });

  it('are removed by their own Trader and by nobody else', async () => {
    const { actor, foreign } = await seedAdversarialTraders();
    const mine = subscription();
    await save(actor, mine);

    const foreignRemove = await foreign.client.rpc('remove_push_subscription', {
      endpoint: mine.endpoint,
    });
    expect(foreignRemove.error).toBeNull();
    expect(await endpointsSeenBy(actor.client)).toEqual([mine.endpoint]);

    const ownRemove = await actor.client.rpc('remove_push_subscription', {
      endpoint: mine.endpoint,
    });
    expect(ownRemove.error).toBeNull();
    expect(await endpointsSeenBy(actor.client)).toEqual([]);
  });

  it('cannot be written directly, nor saved signed out', async () => {
    const { actor, foreign } = await seedAdversarialTraders();
    const mine = subscription();
    await save(actor, mine);

    const insert = await foreign.client
      .from('push_subscriptions')
      .insert({ trader_id: foreign.id, ...subscription() });
    const update = await foreign.client
      .from('push_subscriptions')
      .update({ trader_id: foreign.id })
      .eq('endpoint', mine.endpoint);
    const remove = await foreign.client
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', mine.endpoint);
    const signedOut = await anonClient().rpc(
      'save_push_subscription',
      subscription(),
    );

    expect(insert.error?.code).toBe('42501');
    expect(update.error?.code).toBe('42501');
    expect(remove.error?.code).toBe('42501');
    expect(signedOut.error?.code).toBe('42501');
    expect(await endpointsSeenBy(actor.client)).toEqual([mine.endpoint]);
  });
});

describe('The notification outbox', () => {
  const service = serviceClient();
  let examplemon: number;
  let holofoil: number;

  beforeAll(async () => {
    const card = await seededCard(
      (await seedTrader('Catalog reader')).client,
      EXAMPLEMON,
    );
    examplemon = card.id;
    const variant = card.card_variants.find((v) => v.name === 'Holofoil');
    if (!variant) throw new Error('No Holofoil Variant in the seeded Catalog');
    holofoil = variant.id;
  });

  it('queues one push-only notification for each Trader of a new Match', async () => {
    const [lister, wanter] = await Promise.all([
      seedTrader('Lister'),
      seedTrader('Wanter'),
    ]);
    await addWant(wanter, { card_id: examplemon });

    const listingId = await createListing(lister, holofoil, 'NM');

    // The City is full of other Traders' Wants for this Card from earlier
    // runs, and every one of them is legitimately notified too; the pair
    // this test arranged is the only one it can speak for.
    const topic = `match:${listingId}:${wanter.id}`;
    const { data, error } = await service
      .from('notifications')
      .select('trader_id, kind, channels, title, body, url')
      .eq('topic', topic)
      .order('created_at');
    if (error) throw error;
    expect(data).toEqual(
      expect.arrayContaining([
        {
          trader_id: wanter.id,
          kind: 'new_match',
          channels: ['push'],
          title: 'New match',
          body: 'Lister listed Examplemon (Holofoil, NM), a card you want.',
          url: `/listings/${listingId}`,
        },
        {
          trader_id: lister.id,
          kind: 'new_match',
          channels: ['push'],
          title: 'New match',
          body: 'Wanter wants the Examplemon you listed.',
          url: '/',
        },
      ]),
    );
    expect(data).toHaveLength(2);
  });

  /*
   * A notification names what another Trader listed or wants, and the outbox
   * keeps it after it is sent, so a Trader reading the table would learn
   * about pairs that no longer hold. The notifier, as service_role, is its
   * only reader; the claim and mark RPCs it drains it with are its alone too.
   */
  it('is kept from every Trader, and its RPCs from every client', async () => {
    const { actor } = await seedAdversarialTraders();
    const read = await actor.client.from('notifications').select('id');
    const claim = await actor.client.rpc('claim_notifications', { batch: 1 });
    const mark = await actor.client.rpc('mark_notification_sent', {
      notification_id: randomUUID(),
      channel: 'push',
    });
    const anonClaim = await anonClient().rpc('claim_notifications', {
      batch: 1,
    });

    expect(read.error?.code).toBe('42501');
    expect(claim.error?.code).toBe('42501');
    expect(mark.error?.code).toBe('42501');
    expect(anonClaim.error?.code).toBe('42501');
  });
});
