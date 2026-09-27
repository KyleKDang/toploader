import { execFileSync } from 'node:child_process';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types.ts';

/*
 * What the seam-1 setup and the seam-3 tracers share about the local stack:
 * its URLs and keys, read from `supabase status` rather than from env files,
 * so a suite can only ever reach `supabase start`, never a hosted project;
 * and the wait for it to accept a freshly issued session.
 */

export type LocalStackStatus = {
  API_URL: string;
  DB_URL: string;
  PUBLISHABLE_KEY: string;
  SECRET_KEY: string;
  MAILPIT_URL: string;
};

export function readLocalStackStatus(): LocalStackStatus {
  try {
    return JSON.parse(
      execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    ) as LocalStackStatus;
  } catch {
    throw new Error(
      'The local Supabase stack is not running. Start it with `npx supabase start`.',
    );
  }
}

/*
 * PostgREST sometimes refuses a session Auth has only just issued, with
 * PGRST303 "JWT issued at future", because its clock trails Auth's. It does
 * for about a second after the stack (re)starts, as `supabase db reset` does,
 * and it did once in CI to a Trader signed up mid-run (#71), cause unproven.
 *
 * Polls a signed-in read with `client`'s own session until PostgREST accepts
 * it. An error `retry` does not match is thrown as it came; one that outlasts
 * the deadline is thrown as an Error carrying PostgREST's message.
 */
export async function waitForSignedInReads(
  client: SupabaseClient<Database>,
  {
    retry,
    timeoutMs = 10_000,
  }: { retry: (error: PostgrestError) => boolean; timeoutMs?: number },
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { error } = await client.from('cities').select('id').limit(1);
    if (!error) return;
    if (!retry(error)) throw error;
    if (Date.now() > deadline) {
      throw new Error(
        `The local stack never accepted a session: ${error.code} ${error.message}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** PostgREST's refusal of a session whose `iat` is ahead of its clock. */
export function isJwtIssuedAtFuture(error: PostgrestError) {
  return error.code === 'PGRST303';
}
