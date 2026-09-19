import { execFileSync } from 'node:child_process';

/*
 * The running local stack's URLs and keys, read from `supabase status` rather
 * than from env files, so a suite can only ever reach `supabase start`, never
 * a hosted project. Shared by the seam-1 setup and the seam-3 config.
 */

export type LocalStackStatus = {
  API_URL: string;
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
