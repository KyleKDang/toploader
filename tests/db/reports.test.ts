import { beforeAll, describe, expect, it } from 'vitest';
import { arrangeCity, makeFounder } from './arrange.ts';
import {
  anonClient,
  createListing,
  seededExamplemon,
  seedTrader,
  serviceClient,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * Reporting: any Trader can report another Trader, or one of their
 * Listings, with a reason, and the report lands with the Founders. Only a
 * Founder reads a report, its own reporter included, so a reported Trader
 * never learns who reported them.
 *
 * A Founder reads a reported Listing whatever has happened to it since, so
 * one withdrawn the moment it was reported is still there to judge, and
 * reads no other Listing beyond what any Trader of their City does.
 */

let holofoil: number;

beforeAll(async () => {
  const anyone = await seedTrader('Catalog reader');
  ({ holofoil } = await seededExamplemon(anyone.client));
});

/** The reporter, the Trader they report, a Founder, and a foreign Trader. */
async function seedCast() {
  const [reporter, reported, founder, foreign] = await Promise.all([
    seedTrader('Reporter'),
    seedTrader('Reported'),
    seedTrader('Founder'),
    seedTrader('Foreign'),
  ]);
  await makeFounder(founder.id);
  return { reporter, reported, founder, foreign };
}

/** The reports about one Trader, as one client reads them. */
async function reportsAbout(client: Client, trader: SeededTrader) {
  const { data, error } = await client
    .from('reports')
    .select('reporter_id, trader_id, listing_id, reason')
    .eq('trader_id', trader.id);
  if (error) throw error;
  return data;
}

function reportTrader(by: SeededTrader, traderId: string, reason: string) {
  return by.client.rpc('report_trader', { trader_id: traderId, reason });
}

function reportListing(by: SeededTrader, listingId: string, reason: string) {
  return by.client.rpc('report_listing', { listing_id: listingId, reason });
}

async function readListing(client: Client, listingId: string) {
  const { data, error } = await client
    .from('listings')
    .select('id, status')
    .eq('id', listingId);
  if (error) throw error;
  return data;
}

describe('Reporting a Trader', () => {
  it('lands with the Founders, with the reason as the reporter wrote it', async () => {
    const { reporter, reported, founder } = await seedCast();

    const { error } = await reportTrader(
      reporter,
      reported.id,
      '  Asked me to pay a deposit by Venmo before meeting.  ',
    );

    expect(error).toBeNull();
    expect(await reportsAbout(founder.client, reported)).toEqual([
      {
        reporter_id: reporter.id,
        trader_id: reported.id,
        listing_id: null,
        reason: 'Asked me to pay a deposit by Venmo before meeting.',
      },
    ]);
  });

  it('is allowed against a Trader the reporter has blocked', async () => {
    const { reporter, reported, founder } = await seedCast();
    const blocked = await reporter.client.rpc('block_trader', {
      trader_id: reported.id,
    });
    if (blocked.error) throw blocked.error;

    const { error } = await reportTrader(reporter, reported.id, 'Harassment');

    expect(error).toBeNull();
    expect(await reportsAbout(founder.client, reported)).toHaveLength(1);
  });

  it('is refused against oneself, or a Trader who does not exist', async () => {
    const { reporter, founder } = await seedCast();

    for (const traderId of [reporter.id, crypto.randomUUID()]) {
      const { error } = await reportTrader(reporter, traderId, 'Spam');
      expect(error?.code).toBe('22023');
    }
    expect(await reportsAbout(founder.client, reporter)).toEqual([]);
  });

  it('is refused without a reason, or with one over 1,000 characters', async () => {
    const { reporter, reported, founder } = await seedCast();

    for (const reason of ['', '   ', 'x'.repeat(1001)]) {
      const { error } = await reportTrader(reporter, reported.id, reason);
      expect(error?.code).toBe('22023');
    }
    expect(await reportsAbout(founder.client, reported)).toEqual([]);

    const { error } = await reportTrader(
      reporter,
      reported.id,
      'x'.repeat(1000),
    );
    expect(error).toBeNull();
  });

  it('is refused while signed out', async () => {
    const { reported, founder } = await seedCast();

    const { error } = await anonClient().rpc('report_trader', {
      trader_id: reported.id,
      reason: 'Spam',
    });

    expect(error?.code).toBe('42501');
    expect(await reportsAbout(founder.client, reported)).toEqual([]);
  });

  it('outlives the reported Trader’s account', async () => {
    const { reporter, reported, founder } = await seedCast();
    const filed = await reportTrader(reporter, reported.id, 'Took my cards');
    if (filed.error) throw filed.error;

    const { error } = await serviceClient().auth.admin.deleteUser(reported.id);
    if (error) throw error;

    expect(await reportsAbout(founder.client, reported)).toEqual([
      {
        reporter_id: reporter.id,
        trader_id: reported.id,
        listing_id: null,
        reason: 'Took my cards',
      },
    ]);
  });

  it('cannot be written directly, in the reporter’s name or another’s', async () => {
    const { reporter, reported, founder, foreign } = await seedCast();

    for (const reporterId of [reporter.id, foreign.id]) {
      const { error } = await reporter.client.from('reports').insert({
        reporter_id: reporterId,
        trader_id: reported.id,
        reason: 'Spam',
      });
      expect(error?.code).toBe('42501');
    }
    expect(await reportsAbout(founder.client, reported)).toEqual([]);
  });
});

describe('Reporting a Listing', () => {
  it('lands with the Founders as a report about its Trader', async () => {
    const { reporter, reported, founder } = await seedCast();
    const listingId = await createListing(reported, holofoil, 'NM');

    const { error } = await reportListing(
      reporter,
      listingId,
      'The photos are of a different card.',
    );

    expect(error).toBeNull();
    expect(await reportsAbout(founder.client, reported)).toEqual([
      {
        reporter_id: reporter.id,
        trader_id: reported.id,
        listing_id: listingId,
        reason: 'The photos are of a different card.',
      },
    ]);
  });

  it('is refused for one’s own Listing, or a Listing that does not exist', async () => {
    const { reporter, founder } = await seedCast();
    const own = await createListing(reporter, holofoil, 'NM');

    for (const listingId of [own, crypto.randomUUID()]) {
      const { error } = await reportListing(reporter, listingId, 'Fake');
      expect(error?.code).toBe('22023');
    }
    expect(await reportsAbout(founder.client, reporter)).toEqual([]);
  });

  it('is refused while signed out', async () => {
    const { reported, founder } = await seedCast();
    const listingId = await createListing(reported, holofoil, 'NM');

    const { error } = await anonClient().rpc('report_listing', {
      listing_id: listingId,
      reason: 'Counterfeit',
    });

    expect(error?.code).toBe('42501');
    expect(await reportsAbout(founder.client, reported)).toEqual([]);
  });

  it('stays readable to a Founder once its Trader withdraws it', async () => {
    const { reporter, reported, founder, foreign } = await seedCast();
    const listingId = await createListing(reported, holofoil, 'NM');
    const filed = await reportListing(reporter, listingId, 'Counterfeit');
    if (filed.error) throw filed.error;

    const withdrawn = await reported.client.rpc('withdraw_listing', {
      listing_id: listingId,
    });
    if (withdrawn.error) throw withdrawn.error;

    expect(await readListing(founder.client, listingId)).toEqual([
      { id: listingId, status: 'withdrawn' },
    ]);
    for (const trader of [reporter, foreign]) {
      expect(await readListing(trader.client, listingId)).toEqual([]);
    }
  });

  it('is what lets a Founder read a Listing outside their City', async () => {
    const { reporter, reported } = await seedCast();
    const founder = await seedTrader('Founder elsewhere', await arrangeCity());
    await makeFounder(founder.id);
    const unreported = await createListing(reported, holofoil, 'NM');
    const listingId = await createListing(reported, holofoil, 'DMG');

    expect(await readListing(founder.client, listingId)).toEqual([]);

    const { error } = await reportListing(reporter, listingId, 'Counterfeit');
    expect(error).toBeNull();

    expect(await readListing(founder.client, listingId)).toHaveLength(1);
    expect(await readListing(founder.client, unreported)).toEqual([]);
  });
});

describe('Reports', () => {
  it('are read by no one but a Founder: not the reporter, the reported, or anyone else', async () => {
    const { reporter, reported, founder, foreign } = await seedCast();
    const listingId = await createListing(reported, holofoil, 'NM');
    await Promise.all([
      reportTrader(reporter, reported.id, 'No-show twice'),
      reportListing(reporter, listingId, 'Counterfeit'),
    ]);

    expect(await reportsAbout(founder.client, reported)).toHaveLength(2);
    for (const trader of [reporter, reported, foreign]) {
      expect(await reportsAbout(trader.client, reported)).toEqual([]);
    }
  });

  it('are refused to a signed-out visitor', async () => {
    const { error } = await anonClient().from('reports').select('id');

    expect(error?.code).toBe('42501');
  });
});
