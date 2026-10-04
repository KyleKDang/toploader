import { randomUUID } from 'node:crypto';
import postgres, { type Sql } from 'postgres';
import { inject } from 'vitest';

/*
 * A superuser connection to the local stack, for arranging a database state
 * no client path can reach yet.
 *
 * Seam 1 is supabase-js signed in as a Trader, and that stays the seam every
 * assertion is made through: this is for the arrange step only, and for
 * the one act no client can perform, two writes that overlap
 * (`overlapWrites` below). A Listing
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
 * Backdates one uploaded file, a Listing photo or a verification document,
 * so the reaper sees an upload that has sat unclaimed for that long.
 *
 * Ageing the file rather than moving the run's clock forward is what keeps
 * the suite honest: the reaper's sweeps reclaim every unreferenced file in
 * the bucket, so a run told it is a day later would delete the files other
 * test files had just uploaded and not yet named.
 */
export async function ageUpload(
  path: string,
  hours: number,
  bucket = 'listing-photos',
): Promise<void> {
  await arrange(
    (sql) =>
      sql`update storage.objects
            set created_at = created_at - ${hours} * interval '1 hour'
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

/** One Trader's write, run on a connection that is acting as that Trader. */
export interface TraderWrite<Result> {
  as: { id: string };
  write: (sql: Sql) => Promise<Result>;
}

/**
 * Runs two Traders' writes in transactions that overlap, and returns what
 * each wrote. The first writes and is held open; the second then runs until
 * it has either finished or is waiting on a lock the first holds; only then
 * does the first commit, and the second after it. So neither transaction
 * can have seen the other's write committed when it started, which is the
 * overlap two requests arriving together have, without leaving it to
 * timing.
 *
 * PostgREST gives every request a transaction of its own and commits it, so
 * no client can hold one open: this is a state only the superuser
 * connection reaches. Each transaction takes the `authenticated` role and
 * the Trader's claims, as PostgREST does for a signed-in request, so the
 * write passes the same grants, policies, and `auth.uid()` checks.
 */
export async function overlapWrites<First, Second>(
  first: TraderWrite<First>,
  second: TraderWrite<Second>,
): Promise<[First, Second]> {
  const sql = postgres(inject('supabaseDbUrl'), { max: 3 });
  const beginAs = async (trader: { id: string }) => {
    const connection = await sql.reserve();
    await connection`begin`;
    await connection`
      select
        set_config('role', 'authenticated', true),
        set_config('request.jwt.claims', ${JSON.stringify({
          sub: trader.id,
          role: 'authenticated',
        })}, true)`;
    return connection;
  };
  try {
    const held = await beginAs(first.as);
    const overlapping = await beginAs(second.as);
    const [{ pid }] = await overlapping<
      { pid: number }[]
    >`select pg_backend_pid() as pid`;

    const firstResult = await first.write(held);
    let finished = false;
    const pending = second.write(overlapping);
    const watched = pending.then(
      () => (finished = true),
      () => (finished = true),
    );
    while (!finished) {
      const [activity] = await sql`
        select wait_event_type from pg_stat_activity where pid = ${pid}`;
      if (activity?.wait_event_type === 'Lock') break;
      await Promise.race([
        watched,
        new Promise((resolve) => setTimeout(resolve, 10)),
      ]);
    }

    await held`commit`;
    const secondResult = await pending;
    await overlapping`commit`;
    return [firstResult, secondResult];
  } finally {
    // Without waiting for the reserved connections to be handed back:
    // closing them rolls back whatever a failure left open.
    await sql.end({ timeout: 0 });
  }
}
