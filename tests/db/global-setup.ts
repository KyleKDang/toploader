import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { TestProject } from 'vitest/node';
import type { Database } from '../../src/lib/database.types.ts';
import { readLocalStackStatus, waitForSignedInReads } from '../local-stack.ts';
import { takeStackTurn } from '../stack-turn.ts';

/*
 * Reads the API URL and publishable key from the running local stack rather
 * than from env files, so this suite can only ever reach `supabase start`,
 * never a hosted project.
 */
export default async function setup(project: TestProject) {
  const status = readLocalStackStatus();
  // Held until the last test ends, so another session's run waits for this
  // one rather than overlapping it; see tests/stack-turn.ts.
  const turn = await takeStackTurn(status.DB_URL);
  try {
    await waitForStackToAcceptSessions(status.API_URL, status.PUBLISHABLE_KEY);
  } catch (error) {
    await turn.release();
    throw error;
  }
  project.provide('supabaseUrl', status.API_URL);
  project.provide('supabasePublishableKey', status.PUBLISHABLE_KEY);
  // The server-side key, for seam 2: the Catalog sync runs as service_role.
  project.provide('supabaseSecretKey', status.SECRET_KEY);
  // A superuser connection, for arranging states no client can reach; see
  // tests/db/arrange.ts.
  project.provide('supabaseDbUrl', status.DB_URL);
  return turn.release;
}

/*
 * Wait until a throwaway Trader's new session can read before any test runs.
 * Any error is retried, not only "JWT issued at future": right after
 * `supabase db reset` the stack can refuse in other ways too.
 */
async function waitForStackToAcceptSessions(url: string, key: string) {
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signUpError } = await client.auth.signUp({
    email: `readiness-${randomUUID()}@example.test`,
    password: randomUUID(),
  });
  if (signUpError) throw signUpError;
  await waitForSignedInReads(client, { retry: () => true });
}

declare module 'vitest' {
  export interface ProvidedContext {
    supabaseUrl: string;
    supabasePublishableKey: string;
    supabaseSecretKey: string;
    supabaseDbUrl: string;
  }
}
