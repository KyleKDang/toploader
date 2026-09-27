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
import { arrange, cancelTradeFor, verifyTrader } from '../db/arrange.ts';
import {
  addWant,
  cityId,
  createListing,
  ORANGE_COUNTY,
  seededExamplemon,
  seedTrader,
  serviceClient,
  TEST_CITY,
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
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
// Test City's, from supabase/seed.sql.
const TEST_CITY_TIME_ZONE = 'America/New_York';

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
   * A notification written straight into the outbox the way its producer
   * writes one, for a test about what the notifier does with a row -
   * failing, retrying, going stale - rather than about what queued it.
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

  /**
   * Two Verified Traders of one City, each with a Listing and a browser
   * subscribed, and a Trade proposal from one to the other of both Listings.
   * Test City, for the reason tests/db/trades.test.ts gives: a Trade needs
   * no Match, and in Orange County each Listing would make dozens.
   */
  async function proposedTrade() {
    const [proposer, recipient] = await Promise.all([
      seedTrader('Proposer', TEST_CITY),
      seedTrader('Recipient', TEST_CITY),
    ]);
    await Promise.all([verifyTrader(proposer.id), verifyTrader(recipient.id)]);
    const [proposerBrowser, recipientBrowser, mine, theirs] = await Promise.all(
      [
        subscribe(proposer),
        subscribe(recipient),
        createListing(proposer, holofoil, 'NM'),
        createListing(recipient, holofoil, 'LP'),
      ],
    );
    const { data: tradeId, error } = await proposer.client.rpc('create_trade', {
      recipient_id: recipient.id,
      listing_ids: [mine, theirs],
    });
    if (error) throw error;
    return {
      proposer,
      recipient,
      proposerBrowser,
      recipientBrowser,
      mine,
      theirs,
      tradeId,
      topic: `trade:${tradeId}`,
    };
  }

  /** The emails sent to one Trader. */
  const emailsTo = (trader: SeededTrader) =>
    emails().filter((email) => email.to.includes(trader.email));

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

  it('pushes and emails a new Trade proposal to its recipient alone', async () => {
    const {
      proposer,
      recipient,
      proposerBrowser,
      recipientBrowser,
      tradeId,
      topic,
    } = await proposedTrade();

    await deliver();

    const url = `/trades/${tradeId}`;
    expect(pushesTo(recipientBrowser, topic)).toEqual([
      {
        title: 'New trade proposal',
        body: 'Proposer proposed a trade.',
        url,
        tag: topic,
      },
    ]);
    expect(emailsTo(recipient)).toEqual([
      {
        from: 'Toploader <noreply@mail.toploaderapp.com>',
        to: [recipient.email],
        reply_to: REPLY_TO,
        subject: 'New trade proposal',
        text: `Proposer proposed a trade.\n\n${APP_URL}${url}\n`,
      },
    ]);
    expect(pushesTo(proposerBrowser, topic)).toEqual([]);
    expect(emailsTo(proposer)).toEqual([]);
  });

  it('pushes and emails a counter to the Trader whose answer it now waits on', async () => {
    const {
      proposer,
      recipient,
      proposerBrowser,
      recipientBrowser,
      mine,
      theirs,
      tradeId,
      topic,
    } = await proposedTrade();
    await deliver();
    pushService.reset();
    resend.reset();

    const { error } = await recipient.client.rpc('counter_trade', {
      trade_id: tradeId,
      listing_ids: [mine, theirs],
      requested_cash_cents: 2_000,
    });
    if (error) throw error;
    await deliver();

    expect(pushesTo(proposerBrowser, topic)).toEqual([
      {
        title: 'Trade proposal countered',
        body: 'Recipient countered your trade proposal.',
        url: `/trades/${tradeId}`,
        tag: topic,
      },
    ]);
    expect(emailsTo(proposer).map((email) => email.subject)).toEqual([
      'Trade proposal countered',
    ]);
    expect(pushesTo(recipientBrowser, topic)).toEqual([]);
    expect(emailsTo(recipient)).toEqual([]);
  });

  it('pushes and emails an accept to the Trader who proposed', async () => {
    const {
      proposer,
      recipient,
      proposerBrowser,
      recipientBrowser,
      tradeId,
      topic,
    } = await proposedTrade();
    await deliver();
    pushService.reset();
    resend.reset();

    const { error } = await recipient.client.rpc('accept_trade', {
      trade_id: tradeId,
    });
    if (error) throw error;
    await deliver();

    expect(pushesTo(proposerBrowser, topic)).toEqual([
      {
        title: 'Trade proposal accepted',
        body: 'Recipient accepted your trade proposal.',
        url: `/trades/${tradeId}`,
        tag: topic,
      },
    ]);
    expect(emailsTo(proposer).map((email) => email.subject)).toEqual([
      'Trade proposal accepted',
    ]);
    expect(pushesTo(recipientBrowser, topic)).toEqual([]);
    expect(emailsTo(recipient)).toEqual([]);
  });

  it('pushes and emails an accept of a counter to the Trader who countered', async () => {
    const {
      proposer,
      recipient,
      proposerBrowser,
      recipientBrowser,
      mine,
      theirs,
      tradeId,
      topic,
    } = await proposedTrade();
    const countered = await recipient.client.rpc('counter_trade', {
      trade_id: tradeId,
      listing_ids: [mine, theirs],
      requested_cash_cents: 2_000,
    });
    if (countered.error) throw countered.error;
    await deliver();
    pushService.reset();
    resend.reset();

    const { error } = await proposer.client.rpc('accept_trade', {
      trade_id: tradeId,
    });
    if (error) throw error;
    await deliver();

    expect(pushesTo(recipientBrowser, topic)).toEqual([
      {
        title: 'Trade proposal accepted',
        body: 'Proposer accepted your trade proposal.',
        url: `/trades/${tradeId}`,
        tag: topic,
      },
    ]);
    expect(emailsTo(recipient).map((email) => email.subject)).toEqual([
      'Trade proposal accepted',
    ]);
    expect(pushesTo(proposerBrowser, topic)).toEqual([]);
    expect(emailsTo(proposer)).toEqual([]);
  });

  it('tells nobody about a declined proposal', async () => {
    // The matrix has no row for a decline: the proposer sees it on the
    // Trade, and a no is not something to be woken up for.
    const {
      proposer,
      recipient,
      proposerBrowser,
      recipientBrowser,
      tradeId,
      topic,
    } = await proposedTrade();
    await deliver();
    pushService.reset();
    resend.reset();

    const { error } = await recipient.client.rpc('decline_trade', {
      trade_id: tradeId,
    });
    if (error) throw error;
    await deliver();

    expect(pushesTo(proposerBrowser, topic)).toEqual([]);
    expect(pushesTo(recipientBrowser, topic)).toEqual([]);
    expect(emailsTo(proposer)).toEqual([]);
    expect(emailsTo(recipient)).toEqual([]);
    expect(await outbox(topic)).toHaveLength(1);
  });

  /**
   * A proposal the recipient has accepted, with everything queued so far
   * already delivered, and the first two Safe Spots of the Traders' City.
   */
  async function acceptedTrade() {
    const trade = await proposedTrade();
    const { proposer, recipient, tradeId } = trade;
    const accepted = await recipient.client.rpc('accept_trade', {
      trade_id: tradeId,
    });
    if (accepted.error) throw accepted.error;
    const { data: spots, error } = await proposer.client
      .from('safe_spots')
      .select('id, name')
      .order('name');
    if (error) throw error;
    const [spot, otherSpot] = spots;
    if (!spot || !otherSpot) {
      throw new Error('Fewer than two Safe Spots seeded in Test City');
    }
    await deliver();
    pushService.reset();
    resend.reset();
    return { ...trade, spot, otherSpot };
  }

  /**
   * Puts a Meetup forward on a Trade as the given Trader, at the Safe Spot,
   * the given number of hours out, and says when it is.
   */
  async function putMeetupForward(
    trader: SeededTrader,
    tradeId: string,
    spot: { id: string },
    hoursAway: number,
  ) {
    // On the minute, so the time told reads exactly as it was put forward.
    const meetupAt = new Date(
      Math.ceil((Date.now() + hoursAway * HOUR) / MINUTE) * MINUTE,
    );
    const { error } = await trader.client.rpc('propose_meetup', {
      trade_id: tradeId,
      meetup_at: meetupAt.toISOString(),
      safe_spot_id: spot.id,
    });
    if (error) throw error;
    return meetupAt;
  }

  /**
   * An accepted Trade and a Meetup the proposer has put forward at the
   * first Safe Spot of their City, the given number of hours out, with
   * everything queued so far already delivered.
   */
  async function meetupPutForward(hoursAway: number) {
    const trade = await acceptedTrade();
    const meetupAt = await putMeetupForward(
      trade.proposer,
      trade.tradeId,
      trade.spot,
      hoursAway,
    );
    await deliver();
    pushService.reset();
    resend.reset();
    return { ...trade, spotName: trade.spot.name, meetupAt };
  }

  /**
   * A time as a Trader in Test City reads it on their clock, the way the
   * notifications tell it: "Saturday, October 3 at 2:30 PM", or with only
   * the time of day, "2:30 PM".
   */
  function testCityTime(at: Date, { withDay }: { withDay: boolean }) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: TEST_CITY_TIME_ZONE,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
        .formatToParts(at)
        .map((part) => [part.type, part.value]),
    );
    const time = `${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
    return withDay
      ? `${parts.weekday}, ${parts.month} ${parts.day} at ${time}`
      : time;
  }

  /** A Meetup put forward and confirmed, as `meetupPutForward` leaves one. */
  async function scheduledMeetup(hoursAway: number) {
    const meetup = await meetupPutForward(hoursAway);
    const { error } = await meetup.recipient.client.rpc('confirm_meetup', {
      trade_id: meetup.tradeId,
    });
    if (error) throw error;
    await deliver();
    pushService.reset();
    resend.reset();
    return meetup;
  }

  /**
   * The reminder sweep, run the way pg_cron runs it: the command its job is
   * registered with, as the database's owner. Nothing can call it at the
   * seam a Trader reaches, because no Trader may; so this is the job
   * itself, and a job that is not registered fails the test here.
   */
  async function sweepReminders() {
    await arrange(async (sql) => {
      const [job] = await sql<{ command: string }[]>`
        select command from cron.job where jobname = 'queue-meetup-reminders'`;
      if (!job) throw new Error('The reminder sweep is not scheduled');
      await sql.unsafe(job.command);
    });
  }

  /** The Meetup reminders queued on one topic. */
  async function reminders(topic: string) {
    const { data, error } = await service
      .from('notifications')
      .select('trader_id')
      .eq('topic', topic)
      .eq('kind', 'meetup_reminder');
    if (error) throw error;
    return data;
  }

  it('pushes and emails a confirmed Meetup to both Traders', async () => {
    const {
      proposer,
      recipient,
      proposerBrowser,
      recipientBrowser,
      tradeId,
      topic,
      spotName,
      meetupAt,
    } = await meetupPutForward(24);

    const { error } = await recipient.client.rpc('confirm_meetup', {
      trade_id: tradeId,
    });
    if (error) throw error;
    await deliver();

    const url = `/trades/${tradeId}`;
    expect(pushesTo(proposerBrowser, topic)).toEqual([
      {
        title: 'Meetup confirmed',
        body: `Your meetup with Recipient at ${spotName} on ${testCityTime(meetupAt, { withDay: true })} is confirmed.`,
        url,
        tag: topic,
      },
    ]);
    expect(pushesTo(recipientBrowser, topic)).toEqual([
      {
        title: 'Meetup confirmed',
        body: `Your meetup with Proposer at ${spotName} on ${testCityTime(meetupAt, { withDay: true })} is confirmed.`,
        url,
        tag: topic,
      },
    ]);
    expect(emailsTo(proposer)).toEqual([
      {
        from: 'Toploader <noreply@mail.toploaderapp.com>',
        to: [proposer.email],
        reply_to: REPLY_TO,
        subject: 'Meetup confirmed',
        text: `Your meetup with Recipient at ${spotName} on ${testCityTime(meetupAt, { withDay: true })} is confirmed.\n\n${APP_URL}${url}\n`,
      },
    ]);
    expect(emailsTo(recipient).map((email) => email.subject)).toEqual([
      'Meetup confirmed',
    ]);
  });

  it('pushes and emails a Meetup put forward to the other Trader alone', async () => {
    const {
      proposer,
      recipient,
      proposerBrowser,
      recipientBrowser,
      tradeId,
      topic,
      spot,
    } = await acceptedTrade();

    const meetupAt = await putMeetupForward(proposer, tradeId, spot, 24);
    await deliver();

    const url = `/trades/${tradeId}`;
    const body = `Proposer proposed meeting at ${spot.name} on ${testCityTime(meetupAt, { withDay: true })}.`;
    expect(pushesTo(recipientBrowser, topic)).toEqual([
      { title: 'Meetup proposed', body, url, tag: topic },
    ]);
    expect(emailsTo(recipient)).toEqual([
      {
        from: 'Toploader <noreply@mail.toploaderapp.com>',
        to: [recipient.email],
        reply_to: REPLY_TO,
        subject: 'Meetup proposed',
        text: `${body}\n\n${APP_URL}${url}\n`,
      },
    ]);
    expect(pushesTo(proposerBrowser, topic)).toEqual([]);
    expect(emailsTo(proposer)).toEqual([]);
  });

  it('tells the Trader it now waits on when a different Meetup is put forward', async () => {
    const {
      proposer,
      recipient,
      proposerBrowser,
      recipientBrowser,
      tradeId,
      topic,
      otherSpot,
    } = await meetupPutForward(24);

    const meetupAt = await putMeetupForward(recipient, tradeId, otherSpot, 48);
    await deliver();

    expect(pushesTo(proposerBrowser, topic)).toEqual([
      {
        title: 'Meetup proposed',
        body: `Recipient proposed meeting at ${otherSpot.name} on ${testCityTime(meetupAt, { withDay: true })}.`,
        url: `/trades/${tradeId}`,
        tag: topic,
      },
    ]);
    expect(emailsTo(proposer).map((email) => email.subject)).toEqual([
      'Meetup proposed',
    ]);
    expect(pushesTo(recipientBrowser, topic)).toEqual([]);
    expect(emailsTo(recipient)).toEqual([]);
  });

  it('tells the other Trader again when a lapsed Meetup is put forward anew', async () => {
    // The Trade still waits on the same Trader, so who is asked does not
    // change; only the Meetup does.
    const {
      proposer,
      recipient,
      proposerBrowser,
      recipientBrowser,
      tradeId,
      topic,
      spot,
    } = await meetupPutForward(24);
    await arrange(
      (sql) =>
        sql`update public.trades set meetup_at = now() - interval '1 hour'
              where id = ${tradeId}`,
    );
    await deliver();
    pushService.reset();
    resend.reset();

    const meetupAt = await putMeetupForward(proposer, tradeId, spot, 48);
    await deliver();

    expect(pushesTo(recipientBrowser, topic)).toEqual([
      {
        title: 'Meetup proposed',
        body: `Proposer proposed meeting at ${spot.name} on ${testCityTime(meetupAt, { withDay: true })}.`,
        url: `/trades/${tradeId}`,
        tag: topic,
      },
    ]);
    expect(emailsTo(recipient).map((email) => email.subject)).toEqual([
      'Meetup proposed',
    ]);
    expect(pushesTo(proposerBrowser, topic)).toEqual([]);
    expect(emailsTo(proposer)).toEqual([]);
  });

  it('reminds both Traders by push alone before the Meetup, once', async () => {
    const {
      proposer,
      recipient,
      proposerBrowser,
      recipientBrowser,
      tradeId,
      topic,
      spotName,
      meetupAt,
    } = await scheduledMeetup(1.5);
    // The Meetup was confirmed a day ago and is now an hour and a half
    // away: the reminder is due.
    await arrange(
      (sql) =>
        sql`update public.trades set scheduled_at = scheduled_at - interval '1 day'
              where id = ${tradeId}`,
    );

    await sweepReminders();
    await sweepReminders();
    await deliver();

    const url = `/trades/${tradeId}`;
    expect(pushesTo(proposerBrowser, topic)).toEqual([
      {
        title: 'Meetup coming up',
        body: `Your meetup with Recipient at ${spotName} is at ${testCityTime(meetupAt, { withDay: false })}.`,
        url,
        tag: topic,
      },
    ]);
    expect(pushesTo(recipientBrowser, topic)).toEqual([
      {
        title: 'Meetup coming up',
        body: `Your meetup with Proposer at ${spotName} is at ${testCityTime(meetupAt, { withDay: false })}.`,
        url,
        tag: topic,
      },
    ]);
    expect(emailsTo(proposer)).toEqual([]);
    expect(emailsTo(recipient)).toEqual([]);
    expect(await reminders(topic)).toHaveLength(2);
  });

  it('does not remind of a Meetup not yet near, nor one confirmed already near', async () => {
    const [far, near] = await Promise.all([
      scheduledMeetup(24),
      scheduledMeetup(1.5),
    ]);

    await sweepReminders();

    expect(await reminders(far.topic)).toEqual([]);
    // Its confirmation just told both Traders.
    expect(await reminders(near.topic)).toEqual([]);
  });

  it('pushes a chat message to the other Trader alone, and emails nobody', async () => {
    const {
      proposer,
      recipient,
      proposerBrowser,
      recipientBrowser,
      tradeId,
      topic,
    } = await proposedTrade();
    await deliver();
    pushService.reset();
    resend.reset();

    const { error } = await recipient.client.rpc('send_message', {
      trade_id: tradeId,
      body: 'Can we meet at the station Saturday?',
    });
    if (error) throw error;
    await deliver();

    // The Trade's chat is a topic of its own: on the Trade's, a message
    // would replace the proposal the proposer may not have read yet.
    const chat = `chat:${tradeId}`;
    expect(pushesTo(proposerBrowser, chat)).toEqual([
      {
        title: 'New message',
        body: 'Recipient: Can we meet at the station Saturday?',
        url: `/trades/${tradeId}`,
        tag: chat,
      },
    ]);
    expect(pushesTo(proposerBrowser, topic)).toEqual([]);
    expect(pushesTo(recipientBrowser, chat)).toEqual([]);
    expect(emailsTo(proposer)).toEqual([]);
    expect(emailsTo(recipient)).toEqual([]);
    const [message] = await outbox(chat);
    expect(message).toMatchObject({
      trader_id: proposer.id,
      email_sent_at: null,
    });
    expect(message.sent_at).not.toBeNull();
  });

  it('cuts a long chat message short in its push', async () => {
    const { proposer, proposerBrowser, recipient, tradeId } =
      await proposedTrade();
    await deliver();
    pushService.reset();

    // A push service caps what it carries at about 4 KB once encrypted,
    // and a message may be 2,000 characters of anything.
    const { error } = await recipient.client.rpc('send_message', {
      trade_id: tradeId,
      body: 'é'.repeat(2_000),
    });
    if (error) throw error;
    await deliver();

    const [push] = pushesTo(proposerBrowser, `chat:${tradeId}`);
    expect(push.body).toBe(`Recipient: ${'é'.repeat(139)}…`);
    expect(emailsTo(proposer)).toEqual([]);
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
