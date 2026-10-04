import { randomUUID } from 'node:crypto';
import postgres, { type Sql } from 'postgres';
import { inject } from 'vitest';

/*
 * A superuser connection to the local stack, for arranging a database state
 * no client path can reach yet.
 *
 * Seam 1 is supabase-js signed in as a Trader, and that stays the seam every
 * assertion is made through: this is for the arrange step only. A Listing
 * reaches `traded`, and returns from `in_trade` to `active`, through the
 * completion and cancel steps of the Trade machine (#25), which take two
 * Verified Traders, a proposal, an accept, and a confirmed Meetup to reach.
 * A test whose subject is the Listing rather than the Trade - what City
 * browse does with a traded Listing, what the reaper does with its photos -
 * arranges the Listing's states here instead; tests/db/completion.test.ts
 * proves the Trade machine moves them the same way.
 *
 * It is deliberately not a door in the app: no client role and no
 * server-side job may move a Listing's status, so the only alternative was
 * to grant one of them that power for the benefit of the tests.
 */
export async function arrange<T>(run: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = postgres(inject('supabaseDbUrl'), { max: 1 });
  try {
    return await run(sql);
  } finally {
    await sql.end();
  }
}

/**
 * Takes a Listing through the states a Trade puts it in, ending in a
 * completed Trade. It walks the real path rather than jumping, so the
 * lifecycle trigger has to accept every step: a fixture cannot arrange a
 * state the app could never produce.
 */
export async function completeTradeFor(listingId: string): Promise<void> {
  await arrange(async (sql) => {
    await sql`update public.listings set status = 'in_trade' where id = ${listingId}`;
    await sql`update public.listings set status = 'traded' where id = ${listingId}`;
  });
}

/**
 * Backdates one uploaded file, so the reaper sees an upload that has sat
 * unclaimed past its grace period.
 *
 * Ageing the file rather than moving the run's clock forward is what keeps
 * the suite honest: the reaper's orphan sweep reclaims every unreferenced
 * file in the bucket, so a run told it is a day later would delete the
 * photos other test files had just uploaded and not yet listed.
 */
export async function ageUpload(
  path: string,
  days: number,
  bucket = 'listing-photos',
): Promise<void> {
  await arrange(
    (sql) =>
      sql`update storage.objects
            set created_at = created_at - ${days} * interval '1 day'
            where bucket_id = ${bucket} and name = ${path}`,
  );
}

/** Commits a Listing to a Trade that has not finished yet. */
export async function commitToTrade(listingId: string): Promise<void> {
  await arrange(
    (sql) =>
      sql`update public.listings set status = 'in_trade' where id = ${listingId}`,
  );
}

/**
 * Commits a Listing to a Trade that is then cancelled, so it is active
 * again. It walks both steps for the reason `completeTradeFor` does.
 */
export async function cancelTradeFor(listingId: string): Promise<void> {
  await arrange(async (sql) => {
    await sql`update public.listings set status = 'in_trade' where id = ${listingId}`;
    await sql`update public.listings set status = 'active' where id = ${listingId}`;
  });
}

/**
 * Makes a Trader a Verified Trader, for a test whose subject is what a
 * Verified Trader may do rather than how one is made. The flow that sets
 * this for real takes a Founder's review, which verification.test.ts walks;
 * this sets the one column that review sets.
 */
export async function verifyTrader(traderId: string): Promise<void> {
  await arrange(
    (sql) =>
      sql`update public.traders set verified_at = now() where id = ${traderId}`,
  );
}

/**
 * Makes a Trader a Founder. Membership is granted only by migration
 * (ADR-0007), so no client path reaches it, and that is the point of it;
 * the suites seed a Founder of their own here rather than depend on who the
 * real ones are.
 */
export async function makeFounder(traderId: string): Promise<void> {
  await arrange(
    (sql) => sql`insert into public.founders (trader_id) values (${traderId})`,
  );
}

/**
 * Makes a City no other test or earlier run has Traders in, with a Safe Spot
 * of each kind, and returns its name. Cities and Safe Spots are reference
 * data written only by migrations, so no client path makes one.
 *
 * Every seam-1 and seam-2 test file seeds its Traders into one of these
 * unless told otherwise (`fileCity` in tests/db/seed.ts), per the spec's
 * Testing decisions (#82, #96); the browser tracers have their own
 * `arrangeCity` in tests/browser/session.ts (#72).
 *
 * Named to sort after Orange County, like the tracers' "Tracer City": the
 * stack keeps every run's arranged Cities, and the app's City picker reads
 * the first 1,000 by name, so a name sorting earlier would in time push the
 * launch City out of it (#92).
 */
export async function arrangeCity(
  timeZone = 'America/Los_Angeles',
): Promise<string> {
  const name = `Test Run City ${randomUUID().slice(0, 8)}`;
  await arrange(
    (sql) => sql`
      with city as (
        insert into public.cities (name, time_zone)
          values (${name}, ${timeZone})
          returning id
      )
      insert into public.safe_spots (city_id, name, address, kind)
        select city.id, spot.name, spot.address, spot.kind::public.safe_spot_kind
          from city, (values
            ('Police Station', '1 Arranged Street', 'police_station'),
            ('Library', '2 Arranged Street', 'monitored_site')
          ) as spot (name, address, kind)`,
  );
  return name;
}
