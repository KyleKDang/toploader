import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { TestProject } from 'vitest/node';
import { readLocalStackStatus } from '../local-stack.ts';

/*
 * Reads the API URL and publishable key from the running local stack rather
 * than from env files, so this suite can only ever reach `supabase start`,
 * never a hosted project.
 */
export default async function setup(project: TestProject) {
  const status = readLocalStackStatus();
  await waitForSignedInReads(status.API_URL, status.PUBLISHABLE_KEY);
  project.provide('supabaseUrl', status.API_URL);
  project.provide('supabasePublishableKey', status.PUBLISHABLE_KEY);
}

/*
 * For about a second after the stack (re)starts, as `supabase db reset` does,
 * PostgREST rejects fresh sessions with "JWT issued at future" because its
 * clock trails Auth's. Wait until a new session can read before any test runs.
 */
async function waitForSignedInReads(url: string, key: string) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signUpError } = await client.auth.signUp({
    email: `readiness-${randomUUID()}@example.test`,
    password: randomUUID(),
  });
  if (signUpError) throw signUpError;

  const deadline = Date.now() + 10_000;
  for (;;) {
    const { error } = await client.from('cities').select('id').limit(1);
    if (!error) return;
    if (Date.now() > deadline) {
      throw new Error(
        `The local stack never accepted a session: ${error.message}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

declare module 'vitest' {
  export interface ProvidedContext {
    supabaseUrl: string;
    supabasePublishableKey: string;
  }
}
