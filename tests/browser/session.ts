import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import type { Database } from '../../src/lib/database.types.ts';
import { isJwtIssuedAtFuture, waitForSignedInReads } from '../local-stack.ts';

/*
 * Signing a Trader into the app under test without walking the sign-up
 * screens, for a tracer whose flow starts after Onboarding. The Trader signs
 * up through real Auth on the local stack, and their real session is planted
 * where supabase-js in the page will find it.
 */

/**
 * Where the app remembers that this browser has been through the install
 * step (src/lib/install.ts). A Trader signed in here has finished
 * Onboarding, so the step is marked done along with the session.
 */
export const INSTALL_STEP_KEY = 'toploader:install-step-done';

/** supabase-js's default storage key: `sb-` and the API host's first label. */
export function authStorageKey() {
  return `sb-${new URL(requireEnv('SUPABASE_API_URL')).hostname.split('.')[0]}-auth-token`;
}

/**
 * Signs a new Trader, onboarded in `city`, into the page, and hands back
 * their id, display name, and a client holding the same session, for a
 * tracer that has to check what the app stored as the Trader who stored it.
 *
 * A tracer that reads a City-scoped screen signs in to a City of its own
 * (`arrangeCity`). Playwright runs these files in parallel against one
 * stack that keeps every earlier run's rows, so in a shared City the screen
 * shows all of them, and grows until it outlasts the tracer's wait (#105).
 */
export async function signInAsNewTrader(
  page: Page,
  city: string,
  displayName = 'Priya R.',
) {
  const client = createClient<Database>(
    requireEnv('SUPABASE_API_URL'),
    requireEnv('SUPABASE_PUBLISHABLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signUp({
    email: `trader-${randomUUID()}@example.test`,
    password: randomUUID(),
  });
  if (error) throw error;
  if (!data.session) throw new Error('Signup returned no session');
  await waitForSignedInReads(client, { retry: isJwtIssuedAtFuture });

  const { data: found, error: cityError } = await client
    .from('cities')
    .select('id')
    .eq('name', city)
    .single();
  if (cityError) throw cityError;
  const { error: profileError } = await client.rpc('set_trader_profile', {
    display_name: displayName,
    city_id: found.id,
    attests_adult: true,
  });
  if (profileError) throw profileError;

  await page.goto('/sign-up');
  await page.evaluate(
    ([key, session, installStepKey]) => {
      localStorage.setItem(key, session);
      localStorage.setItem(installStepKey, '1');
    },
    [authStorageKey(), JSON.stringify(data.session), INSTALL_STEP_KEY],
  );

  return { id: data.user?.id ?? '', displayName, client };
}

/**
 * A superuser connection to the local stack, for a tracer's arrange step:
 * a state no client path can reach, as tests/db/arrange.ts is for seam 1.
 */
async function arrange<T>(run: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(requireEnv('SUPABASE_DB_URL'), { max: 1 });
  try {
    return await run(sql);
  } finally {
    await sql.end();
  }
}

/**
 * A City no other tracer or earlier run has Traders in, and its name.
 * Cities are reference data written only by migrations, so no client path
 * makes one.
 *
 * For a tracer whose screen shows what a City's other Traders did: in a
 * shared City the flow under test competes with every Listing and Want the
 * stack has accumulated, and how long it takes depends on how many earlier
 * runs there were (#72).
 */
export async function arrangeCity() {
  const name = `Tracer City ${randomUUID().slice(0, 8)}`;
  await arrange(
    (sql) => sql`insert into public.cities (name, time_zone)
                 values (${name}, 'America/Los_Angeles')`,
  );
  return name;
}

/**
 * Makes a Trader a Verified Trader, for a tracer whose flow starts after
 * verification. The flow that sets this for real takes a Founder's review,
 * and has a tracer of its own (verification.spec.ts); the seam-1 suites
 * arrange it for the same reason (tests/db/arrange.ts).
 */
export async function verifyTrader(traderId: string) {
  await arrange(
    (sql) =>
      sql`update public.traders set verified_at = now() where id = ${traderId}`,
  );
}

/**
 * Makes a Trader a Founder. Membership is granted only by migration
 * (ADR-0007), so no client path makes one.
 */
export async function makeFounder(traderId: string) {
  await arrange(
    (sql) => sql`insert into public.founders (trader_id) values (${traderId})`,
  );
}

/**
 * Clears the review queue of what earlier runs left waiting. The seam-1
 * suites leave a dozen requests pending per run on a stack that outlives
 * them, and the queue a Founder reads is oldest first: without this, how
 * far down the tracer's own request sits, and whether it is on the page at
 * all, would depend on how many runs came before (#72, #82).
 *
 * Only what is older than any run still going, so a suite running against
 * the same stack keeps the requests it is in the middle of.
 */
export async function clearStaleReviewQueue() {
  await arrange(
    (sql) => sql`delete from public.verification_requests
                 where status = 'pending'
                   and created_at < now() - interval '10 minutes'`,
  );
}

/**
 * How many verification documents Storage's index holds for a Trader, read
 * past every policy, for a tracer that has to say none is left.
 */
export async function verificationDocumentCount(traderId: string) {
  return arrange(async (sql) => {
    const [{ count }] = await sql<[{ count: number }]>`
      select count(*)::int as count from storage.objects
      where bucket_id = 'verification-documents'
        and name like ${traderId + '/%'}`;
    return count;
  });
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `${name} is missing; run this through playwright.config.ts`,
    );
  return value;
}
