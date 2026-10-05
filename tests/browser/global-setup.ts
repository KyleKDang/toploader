import { readdirSync } from 'node:fs';
import { readLocalStackStatus } from '../local-stack.ts';

/*
 * Before any tracer: the local stack's edge runtime serves every function in
 * supabase/functions. Without this check, the tracer that calls a function
 * the runtime cannot serve waits out its whole budget and fails at its own
 * expect. CI starts a fresh stack each run and never sees either failure; a
 * long-lived local stack sees both.
 */
export default async function globalSetup() {
  const { API_URL } = readLocalStackStatus();
  const functions = readdirSync(
    new URL('../../supabase/functions/', import.meta.url),
    { withFileTypes: true },
  )
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name);
  await checkEdgeRuntime(API_URL, functions);
}

const RESTART =
  'Restart the stack from the main checkout, never from a worktree ' +
  '(`npx supabase stop`, then `npx supabase start`), and run again.';

/**
 * Throws, naming each function and the restart, unless the runtime at
 * `apiUrl` both knows and can boot every one of `functions`.
 */
export async function checkEdgeRuntime(apiUrl: string, functions: string[]) {
  const missing: string[] = [];
  const unbootable: string[] = [];
  for (const name of functions) {
    const response = await fetch(`${apiUrl}/functions/v1/${name}`, {
      method: 'OPTIONS',
    });
    const body = await response.text();
    // The runtime learns which functions exist when `supabase start` creates
    // it, so one added since answers its own 404, told apart from a 404 a
    // function's handler might give (#105).
    if (response.status === 404 && body === 'Function not found') {
      missing.push(name);
    }
    // The runtime loads a function's code from the directory `supabase start`
    // ran in, so once that directory is gone, as a removed worktree is, every
    // function answers 503 BOOT_ERROR (#113).
    if (response.status === 503 && isBootError(body)) {
      unbootable.push(name);
    }
  }
  const problems = [
    missing.length > 0 &&
      `does not serve ${missing.join(', ')}: it predates them`,
    unbootable.length > 0 &&
      `cannot boot ${unbootable.join(', ')}: the directory it loads them ` +
        'from is likely gone',
  ].filter(Boolean);
  if (problems.length > 0) {
    throw new Error(
      `The local edge runtime ${problems.join('; and it ')}. ${RESTART}`,
    );
  }
}

function isBootError(body: string) {
  try {
    return (JSON.parse(body) as { code?: unknown }).code === 'BOOT_ERROR';
  } catch {
    return false;
  }
}
