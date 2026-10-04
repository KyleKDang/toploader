import { readdirSync } from 'node:fs';
import { readLocalStackStatus } from '../local-stack.ts';

/*
 * Before any tracer: the local stack's edge runtime serves every function in
 * supabase/functions.
 *
 * The runtime learns which functions exist when `supabase start` creates it,
 * so a function added since then answers 404 "Function not found" until the
 * stack restarts. CI starts a fresh stack each run and never sees this; a
 * long-lived local stack does, and without this check the tracer that calls
 * the function waits out its whole budget and fails at its own expect (#105).
 */
export default async function globalSetup() {
  const { API_URL } = readLocalStackStatus();
  const functions = readdirSync(
    new URL('../../supabase/functions/', import.meta.url),
    { withFileTypes: true },
  )
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name);

  const missing: string[] = [];
  for (const name of functions) {
    const response = await fetch(`${API_URL}/functions/v1/${name}`, {
      method: 'OPTIONS',
    });
    // The runtime's own answer for a function it does not know, told apart
    // from a 404 a function's handler might give.
    const body = await response.text();
    if (response.status === 404 && body === 'Function not found') {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `The local edge runtime does not serve ${missing.join(', ')}: it ` +
        'predates them. Restart the stack (`npx supabase stop`, then ' +
        '`npx supabase start`) and run again.',
    );
  }
}
