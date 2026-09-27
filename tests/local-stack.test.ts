import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Database } from '../src/lib/database.types.ts';
import { isJwtIssuedAtFuture, waitForSignedInReads } from './local-stack.ts';

/*
 * The wait for PostgREST to accept a fresh session (#71), with PostgREST
 * faked at the network edge: supabase-js is handed a `fetch` that answers
 * each signed-in read from a script, so the refusal CI saw once in forty
 * runs can be served on demand.
 */

const jwtIssuedAtFuture = {
  status: 401,
  body: {
    code: 'PGRST303',
    details: null,
    hint: null,
    message: 'JWT issued at future',
  },
};
const cityNotReadable = {
  status: 403,
  body: {
    code: '42501',
    details: null,
    hint: null,
    message: 'permission denied for table cities',
  },
};
const acceptedRead = { status: 200, body: [{ id: 'a-city' }] };

type Reply = { status: number; body: unknown };

/** A client whose every read gets the next reply, the last one repeating. */
function clientAgainstFakePostgrest(replies: Reply[]) {
  const reads: string[] = [];
  const client = createClient<Database>(
    'http://postgrest.fake',
    'a-publishable-key',
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input) => {
          reads.push(new Request(input).url);
          const reply = replies[Math.min(reads.length, replies.length) - 1];
          return Promise.resolve(
            new Response(JSON.stringify(reply.body), {
              status: reply.status,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        },
      },
    },
  );
  return { client, reads };
}

describe('waiting for PostgREST to accept a fresh session', () => {
  it('gets through a "JWT issued at future" refusal once the session is accepted', async () => {
    const { client, reads } = clientAgainstFakePostgrest([
      jwtIssuedAtFuture,
      jwtIssuedAtFuture,
      acceptedRead,
    ]);

    await waitForSignedInReads(client, { retry: isJwtIssuedAtFuture });

    expect(reads).toHaveLength(3);
    expect(reads[0]).toContain('/rest/v1/cities');
  });

  it('throws any other error at once, without retrying', async () => {
    const { client, reads } = clientAgainstFakePostgrest([
      cityNotReadable,
      acceptedRead,
    ]);

    await expect(
      waitForSignedInReads(client, { retry: isJwtIssuedAtFuture }),
    ).rejects.toMatchObject({ code: '42501' });
    expect(reads).toHaveLength(1);
  });

  it('fails past the deadline with an Error naming what PostgREST said', async () => {
    const { client, reads } = clientAgainstFakePostgrest([jwtIssuedAtFuture]);

    const waited = waitForSignedInReads(client, {
      retry: isJwtIssuedAtFuture,
      timeoutMs: 500,
    });

    await expect(waited).rejects.toThrow(Error);
    await expect(waited).rejects.toThrow('JWT issued at future');
    expect(reads.length).toBeGreaterThan(1);
  });

  it('retries every error when told to, as the seam-1 startup wait asks', async () => {
    const { client, reads } = clientAgainstFakePostgrest([
      cityNotReadable,
      jwtIssuedAtFuture,
      acceptedRead,
    ]);

    await waitForSignedInReads(client, { retry: () => true });

    expect(reads).toHaveLength(3);
  });
});
