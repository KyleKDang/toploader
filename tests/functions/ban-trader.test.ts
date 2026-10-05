import { randomUUID } from 'node:crypto';
import { describe, expect, inject, it } from 'vitest';
import { banTrader } from '../../supabase/functions/_shared/ban-trader.ts';
import { arrange, makeFounder } from '../db/arrange.ts';
import { seedTrader, serviceClient, type SeededTrader } from '../db/seed.ts';

/*
 * Seam 2: the `ban_trader` edge function, run against the local stack
 * in-process the way the function runs it. Nothing here is faked: the side
 * effect that leaves the database is Auth, and that is the local stack's
 * own.
 *
 * This file is the function's own steps: who may ban, whom, and that the
 * ban lands in Auth. What the ban then does to the database is the closing
 * trigger's, proven at seam 1 (tests/db/bans.test.ts).
 */

const options = () => ({
  supabaseUrl: inject('supabaseUrl'),
  supabaseSecretKey: inject('supabaseSecretKey'),
});

/** Bans a Trader as the Trader a client is signed in to. */
async function banAs(caller: Pick<SeededTrader, 'client'>, traderId: unknown) {
  const { data } = await caller.client.auth.getSession();
  return banTrader({
    ...options(),
    accessToken: data.session?.access_token ?? null,
    traderId,
  });
}

/** Whether Auth holds the account banned, and the database marks it. */
async function isBanned(traderId: string) {
  const { data } = await serviceClient().auth.admin.getUserById(traderId);
  const until = data.user?.banned_until;
  const [row] = await arrange(
    (sql) =>
      sql<
        { banned_at: Date | null }[]
      >`select banned_at from public.traders where id = ${traderId}`,
  );
  return {
    auth: until !== undefined && new Date(until) > new Date(),
    marked: row.banned_at !== null,
  };
}

const BANNED = { auth: true, marked: true };
const NOT_BANNED = { auth: false, marked: false };

async function founderAndTarget() {
  const [founder, target] = await Promise.all([
    seedTrader('Founder'),
    seedTrader('Target'),
  ]);
  await makeFounder(founder.id);
  return { founder, target };
}

describe('The ban_trader function', { timeout: 60_000 }, () => {
  it('bans the Trader a Founder names, in Auth and in the database', async () => {
    const { founder, target } = await founderAndTarget();

    expect(await banAs(founder, target.id)).toBe('banned');

    expect(await isBanned(target.id)).toEqual(BANNED);
    expect(await isBanned(founder.id)).toEqual(NOT_BANNED);
  });

  it('refuses a Trader who is not a Founder, and bans nobody', async () => {
    const { target } = await founderAndTarget();
    const caller = await seedTrader('Caller');

    expect(await banAs(caller, target.id)).toBe('forbidden');
    // Asked about nobody, the answer is the same: it says nothing about
    // who exists.
    expect(await banAs(caller, randomUUID())).toBe('forbidden');

    expect(await isBanned(target.id)).toEqual(NOT_BANNED);
  });

  it('bans nobody when signed out, or with a token that is not a session', async () => {
    const { target } = await founderAndTarget();

    for (const accessToken of [
      null,
      'not-a-session',
      // The publishable key is a token every visitor holds.
      inject('supabasePublishableKey'),
    ]) {
      expect(
        await banTrader({ ...options(), accessToken, traderId: target.id }),
      ).toBe('signed_out');
    }
    expect(await isBanned(target.id)).toEqual(NOT_BANNED);
  });

  it('refuses to ban a Founder, a deleted account, nobody, or a malformed id', async () => {
    const { founder, target } = await founderAndTarget();
    const other = await seedTrader('Other Founder');
    await makeFounder(other.id);
    await serviceClient().auth.admin.deleteUser(target.id);

    for (const traderId of [
      other.id,
      founder.id,
      target.id,
      randomUUID(),
      'not-an-id',
      undefined,
    ]) {
      expect(await banAs(founder, traderId)).toBe('refused');
    }
    expect(await isBanned(other.id)).toEqual(NOT_BANNED);
  });

  it('bans a Trader already banned again without complaint', async () => {
    const { founder, target } = await founderAndTarget();
    await banAs(founder, target.id);

    expect(await banAs(founder, target.id)).toBe('banned');
    expect(await isBanned(target.id)).toEqual(BANNED);
  });
});
