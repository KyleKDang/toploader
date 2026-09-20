import postgres, { type Sql } from 'postgres';
import { inject } from 'vitest';

/*
 * A superuser connection to the local stack, for arranging a database state
 * no client path can reach yet.
 *
 * Seam 1 is supabase-js signed in as a Trader, and that stays the seam every
 * assertion is made through: this is for the arrange step only. A Listing
 * reaches `in_trade` and `traded` through the Trade machine (#21, #25),
 * which does not exist, so without this there is no way to ask what City
 * browse does with a traded Listing, or what the reaper does with the photos
 * of a completed Trade - both of which #17 has to answer.
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
