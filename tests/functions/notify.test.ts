import {
  createECDH,
  createPublicKey,
  randomBytes,
  randomUUID,
  verify,
  type ECDH,
} from 'node:crypto';
import { decrypt } from 'http_ece';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';
import { deliverNotifications } from '../../supabase/functions/_shared/notify.ts';
import {
  fromBase64Url,
  generateVapidKeys,
  toBase64Url,
  type VapidKeys,
} from '../../supabase/functions/_shared/vapid.ts';
import { arrange, cancelTradeFor } from '../db/arrange.ts';
import {
  addWant,
  cityId,
  createListing,
  ORANGE_COUNTY,
  seededExamplemon,
  seedTrader,
  serviceClient,
  type SeededTrader,
} from '../db/seed.ts';
import { startCaptureServer, type CaptureServer } from './capture-server.ts';

/*
 * Seam 2: the notifier, run against the local stack in-process the way the
 * edge function runs it, with the push service and Resend faked at the
 * network edge. Assertions are on the captured outbound requests and on the
 * outbox.
 *
 * A captured push is decrypted with the subscription's own keys through
 * http_ece, an implementation the notifier shares nothing with, and its
 * VAPID token is verified against the public key the same way a push
 * service would; so what is asserted is what a browser would receive.
 *
 * The outbox is shared with every other test file and every earlier run, so
 * a run of the notifier drains more than this file queued. Every assertion
 * is about the endpoints and rows this file arranged.
 */

const APP_URL = 'https://toploaderapp.com';
const REPLY_TO = 'hello@toploaderapp.com';
const RESEND_API_KEY = 're_test_key';

interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

interface EmailRequest {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  text: string;
}

// Each test seeds two Traders, a photo and a Listing, then drains an outbox
// the whole suite is writing to at once; under a full parallel run that
// takes longer than vitest's five-second default.
describe('The notifier', { timeout: 30_000 }, () => {
  const service = serviceClient();
  let pushService: CaptureServer;
  let resend: CaptureServer;
  let vapid: VapidKeys;
  let examplemon: number;
  let holofoil: number;

  beforeAll(async () => {
    [pushService, resend] = await Promise.all([
      startCaptureServer({ tls: true }),
      startCaptureServer(),
    ]);
    // The fake push service's certificate is self-signed, and this is how
    // Node's fetch is told to accept one. It reaches only this test's own
    // worker process, and nothing else in it speaks TLS.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    vapid = { subject: `mailto:${REPLY_TO}`, ...(await generateVapidKeys()) };
    ({ card: examplemon, holofoil } = await seededExamplemon(
      (await seedTrader('Catalog reader')).client,
    ));
  });

  afterAll(async () => {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    // The stack outlives this run, and so would these subscriptions: the
    // next run's Listings would queue pushes to a server that is gone.
    const { error } = await service
      .from('push_subscriptions')
      .delete()
      .like('endpoint', `${pushService.baseUrl}/%`);
    if (error) throw error;
    await Promise.all([pushService.close(), resend.close()]);
  });

  beforeEach(() => {
    pushService.reset();
    resend.reset();
  });

  const deliver = () =>
    deliverNotifications({
      supabaseUrl: inject('supabaseUrl'),
      supabaseSecretKey: inject('supabaseSecretKey'),
      vapid,
      email: {
        resendApiKey: RESEND_API_KEY,
        resendBaseUrl: resend.baseUrl,
        replyTo: REPLY_TO,
      },
      appUrl: APP_URL,
    });

  /**
   * A browser's subscription: a P-256 key pair and an auth secret it made,
   * and an endpoint at the fake push service. Saved through the same RPC
   * the app calls.
   */
  async function subscribe(trader: SeededTrader) {
    const keys: ECDH = createECDH('prime256v1');
    keys.generateKeys();
    const auth = toBase64Url(randomBytes(16));
    const path = `/push/${randomUUID()}`;
    const { error } = await trader.client.rpc('save_push_subscription', {
      endpoint: `${pushService.baseUrl}${path}`,
      p256dh: toBase64Url(keys.getPublicKey()),
      auth,
    });
    if (error) throw error;
    return { path, keys, auth };
  }

  type Subscription = Awaited<ReturnType<typeof subscribe>>;

  /**
   * Every push captured for one subscription, decrypted as its browser
   * would, narrowed to one topic where given: a Want for Examplemon matches
   * every Listing of it in the City, and a Listing every Want, so a browser
   * here legitimately hears about pairs this test did not arrange.
   */
  function pushesTo(
    { path, keys, auth }: Subscription,
    topic?: string,
  ): PushPayload[] {
    const pushes = pushService.requests
      .filter((request) => request.path === path)
      .map((request) => {
        expect(request.method).toBe('POST');
        expect(request.headers['content-encoding']).toBe('aes128gcm');
        expect(request.headers['content-type']).toBe(
          'application/octet-stream',
        );
        expect(Number(request.headers.ttl)).toBeGreaterThan(0);
        expectVapidAuthorization(request.headers.authorization);
        const plaintext = decrypt(request.body, {
          version: 'aes128gcm',
          privateKey: keys,
          authSecret: auth,
        });
        return JSON.parse(plaintext.toString('utf8')) as PushPayload;
      });
    return topic ? pushes.filter((push) => push.tag === topic) : pushes;
  }

  /** Checks the token the way a push service does: our key, their origin. */
  function expectVapidAuthorization(header: string | undefined) {
    const match = /^vapid t=([^,]+), k=(\S+)$/.exec(header ?? '');
    if (!match) throw new Error(`Not a VAPID header: ${header}`);
    const [, token, key] = match;
    expect(key).toBe(vapid.publicKey);

    const [encodedHeader, encodedClaims, encodedSignature] = token.split('.');
    const claims = JSON.parse(
      Buffer.from(fromBase64Url(encodedClaims)).toString('utf8'),
    ) as { aud: string; exp: number; sub: string };
    expect(claims.aud).toBe(pushService.baseUrl);
    expect(claims.sub).toBe(vapid.subject);
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
    expect(claims.exp).toBeLessThanOrEqual(Date.now() / 1000 + 24 * 60 * 60);

    const point = fromBase64Url(vapid.publicKey);
    const publicKey = createPublicKey({
      format: 'jwk',
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: toBase64Url(point.slice(1, 33)),
        y: toBase64Url(point.slice(33, 65)),
      },
    });
    const verified = verify(
      'sha256',
      Buffer.from(`${encodedHeader}.${encodedClaims}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(fromBase64Url(encodedSignature)),
    );
    expect(verified).toBe(true);
  }

  /** The emails Resend was asked to send, in order. */
  function emails(): EmailRequest[] {
    return resend.requests.map((request) => {
      expect(request.method).toBe('POST');
      expect(request.path).toBe('/emails');
      expect(request.headers.authorization).toBe(`Bearer ${RESEND_API_KEY}`);
      expect(request.headers['content-type']).toBe('application/json');
      return JSON.parse(request.body.toString('utf8')) as EmailRequest;
    });
  }

  /** The outbox rows on one topic, as the operator reads them. */
  async function outbox(topic: string) {
    const { data, error } = await service
      .from('notifications')
      .select('trader_id, push_sent_at, email_sent_at, sent_at, attempts')
      .eq('topic', topic)
      .order('created_at');
    if (error) throw error;
    return data;
  }

  /** A Match between two fresh Traders, each subscribed in one browser. */
  async function matchedPair() {
    const [lister, wanter] = await Promise.all([
      seedTrader('Lister'),
      seedTrader('Wanter'),
    ]);
    const [listerBrowser, wanterBrowser] = await Promise.all([
      subscribe(lister),
      subscribe(wanter),
    ]);
    await addWant(wanter, { card_id: examplemon });
    const listingId = await createListing(lister, holofoil, 'NM');
    return {
      lister,
      wanter,
      listerBrowser,
      wanterBrowser,
      listingId,
      topic: `match:${listingId}:${wanter.id}`,
    };
  }

  /**
   * A notification of a kind whose producer is a later ticket, written the
   * way that producer will write it. The email path has to be proven before
   * anything rides it.
   */
  async function queue(
    trader: SeededTrader,
    kind: 'new_proposal' | 'new_match',
    { createdAt = new Date().toISOString() }: { createdAt?: string } = {},
  ) {
    const topic = `test:${randomUUID()}`;
    const [title, body, url] =
      kind === 'new_proposal'
        ? ['New trade proposal', 'Ash proposed a trade.', '/trades/example']
        : ['New match', 'Ash wants the Examplemon you listed.', '/'];
    await arrange(
      (sql) =>
        sql`insert into public.notifications
              (trader_id, kind, topic, title, body, url, created_at)
            values (${trader.id}, ${kind}, ${topic}, ${title}, ${body}, ${url},
              ${createdAt})`,
    );
    return topic;
  }

  it('pushes a new Match to each Trader once, and emails neither', async () => {
    const { lister, wanter, listerBrowser, wanterBrowser, listingId, topic } =
      await matchedPair();

    await deliver();

    expect(pushesTo(wanterBrowser, topic)).toEqual([
      {
        title: 'New match',
        body: 'Lister listed Examplemon (Holofoil, NM), a card you want.',
        url: `/listings/${listingId}`,
        tag: topic,
      },
    ]);
    expect(pushesTo(listerBrowser, topic)).toEqual([
      {
        title: 'New match',
        body: 'Wanter wants the Examplemon you listed.',
        url: '/',
        tag: topic,
      },
    ]);
    expect(
      emails().filter((email) =>
        email.to.some((to) => [lister.email, wanter.email].includes(to)),
      ),
    ).toEqual([]);
    for (const row of await outbox(topic)) {
      expect(row.push_sent_at).not.toBeNull();
      expect(row.email_sent_at).toBeNull();
      expect(row.sent_at).not.toBeNull();
    }
  });

  it('pushes to every browser a Trader has said yes in', async () => {
    const { wanter, wanterBrowser, topic } = await matchedPair();
    const phone = await subscribe(wanter);

    await deliver();

    expect(pushesTo(wanterBrowser, topic)).toHaveLength(1);
    expect(pushesTo(phone, topic)).toHaveLength(1);
  });

  it('does not push again when the pair is evaluated again, or the notifier runs again', async () => {
    const { lister, wanter, listerBrowser, wanterBrowser, listingId, topic } =
      await matchedPair();
    await deliver();

    // Every path that re-evaluates this pair (tests/db/matches.test.ts),
    // then the notifier once more.
    await cancelTradeFor(listingId);
    await addWant(wanter, { card_id: examplemon, min_condition: 'LP' });
    for (const trader of [lister, wanter]) {
      const { error } = await trader.client.rpc('set_trader_profile', {
        display_name: trader.displayName,
        city_id: await cityId(trader.client, ORANGE_COUNTY),
        attests_adult: true,
      });
      if (error) throw error;
    }
    await deliver();

    expect(pushesTo(wanterBrowser, topic)).toHaveLength(1);
    expect(pushesTo(listerBrowser, topic)).toHaveLength(1);
  });

  it('sends each notification once when two runs overlap', async () => {
    const { listerBrowser, wanterBrowser, topic } = await matchedPair();

    await Promise.all([deliver(), deliver()]);

    expect(pushesTo(wanterBrowser, topic)).toHaveLength(1);
    expect(pushesTo(listerBrowser, topic)).toHaveLength(1);
  });

  it('emails through Resend, and pushes too, for a kind the matrix emails', async () => {
    const trader = await seedTrader('Proposed to');
    const browser = await subscribe(trader);
    const topic = await queue(trader, 'new_proposal');

    await deliver();

    expect(emails().filter((email) => email.to.includes(trader.email))).toEqual(
      [
        {
          from: 'Toploader <noreply@mail.toploaderapp.com>',
          to: [trader.email],
          reply_to: REPLY_TO,
          subject: 'New trade proposal',
          text: `Ash proposed a trade.\n\n${APP_URL}/trades/example\n`,
        },
      ],
    );
    expect(pushesTo(browser, topic)).toEqual([
      {
        title: 'New trade proposal',
        body: 'Ash proposed a trade.',
        url: '/trades/example',
        tag: topic,
      },
    ]);
    expect(await outbox(topic)).toMatchObject([
      {
        push_sent_at: expect.any(String) as string,
        email_sent_at: expect.any(String) as string,
        sent_at: expect.any(String) as string,
      },
    ]);
  });

  it('retries only the channel that failed', async () => {
    const trader = await seedTrader('Proposed to');
    const browser = await subscribe(trader);
    const topic = await queue(trader, 'new_proposal');
    resend.answer('/emails', 500);

    const report = await deliver();

    expect(report.failures).toEqual(
      expect.arrayContaining([
        expect.stringMatching(new RegExp(`^${topic}: Resend answered 500`)),
      ]),
    );

    expect(pushesTo(browser, topic)).toHaveLength(1);
    expect(await outbox(topic)).toMatchObject([
      { push_sent_at: expect.any(String) as string, email_sent_at: null },
    ]);
    const [row] = await outbox(topic);
    expect(row?.sent_at).toBeNull();

    // The second act's arrange: the claim on the row has to lapse before
    // another run may take it, and nothing but time does that.
    await arrange(
      (sql) =>
        sql`update public.notifications
              set claimed_at = claimed_at - interval '6 minutes'
              where topic = ${topic}`,
    );
    resend.reset();
    pushService.reset();
    await deliver();

    expect(pushesTo(browser, topic)).toHaveLength(0);
    expect(
      emails().filter((email) => email.to.includes(trader.email)),
    ).toHaveLength(1);
    const [retried] = await outbox(topic);
    expect(retried?.sent_at).not.toBeNull();
    expect(retried?.attempts).toBe(2);
  });

  it('drops a subscription the push service says is gone', async () => {
    const { wanter, wanterBrowser, topic } = await matchedPair();
    const oldPhone = await subscribe(wanter);
    pushService.answer(oldPhone.path, 410);

    await deliver();

    expect(pushesTo(wanterBrowser, topic)).toHaveLength(1);
    const { data, error } = await wanter.client
      .from('push_subscriptions')
      .select('endpoint');
    if (error) throw error;
    expect(data.map((row) => row.endpoint)).toEqual([
      `${pushService.baseUrl}${wanterBrowser.path}`,
    ]);
    expect((await outbox(topic)).every((row) => row.sent_at !== null)).toBe(
      true,
    );
  });

  it('marks a notification sent for a Trader with no browser subscribed', async () => {
    const trader = await seedTrader('Unsubscribed');
    const topic = await queue(trader, 'new_match');

    await deliver();

    // Nothing to push is the push channel done, not the row stuck: the row
    // is sent, without ever being handed to the notifier, and will not be
    // claimed again.
    const [row] = await outbox(topic);
    expect(row?.sent_at).not.toBeNull();
    expect(row?.attempts).toBe(0);
  });

  it('leaves a day-old notification unsent', async () => {
    const trader = await seedTrader('Proposed to');
    const browser = await subscribe(trader);
    const stale = await queue(trader, 'new_proposal', {
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    });

    await deliver();

    expect(pushesTo(browser)).toEqual([]);
    expect(emails().filter((email) => email.to.includes(trader.email))).toEqual(
      [],
    );
    const [row] = await outbox(stale);
    expect(row?.sent_at).toBeNull();
    expect(row?.attempts).toBe(0);
  });
});
