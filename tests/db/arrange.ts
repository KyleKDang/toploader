import postgres, { type Sql } from 'postgres';
import { inject } from 'vitest';

/*
 * A superuser connection to the local stack, for arranging a database state
 * no client path can reach yet.
 *
 * Seam 1 is supabase-js signed in as a Trader, and that stays the seam every
 * assertion is made through: this is for the arrange step only. A Listing
 * reaches `traded`, and returns from `in_trade` to `active`, through the
 * completion and cancel steps of the Trade machine (#25), which do not exist
 * yet, so without this there is no way to ask what City browse does with a
 * traded Listing, or what the reaper does with the photos of a completed
 * Trade - both of which #17 had to answer. A test about a Listing simply
 * being committed to a Trade may still arrange that here, rather than
 * seeding two Verified Traders and a proposal to get there.
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
export async function ageUpload(path: string, days: number): Promise<void> {
  await arrange(
    (sql) =>
      sql`update storage.objects
            set created_at = created_at - ${days} * interval '1 day'
            where bucket_id = 'listing-photos' and name = ${path}`,
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
 * Makes a Trader a Verified Trader. The submit-and-review flow that sets
 * this for real is #26; until it exists nothing a client can call reaches
 * it, and the gate on sending and accepting a Trade proposal (#21) has to be
 * proven before then.
 */
export async function verifyTrader(traderId: string): Promise<void> {
  await arrange(
    (sql) =>
      sql`update public.traders set verified_at = now() where id = ${traderId}`,
  );
}
