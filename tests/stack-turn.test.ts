import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { takeStackTurn, type StackTurn } from './stack-turn.ts';

// Each test takes turns under a key of its own, never the suite's: this file
// runs inside an `npm test` run that already holds the suite's turn.
const ownKey = () => `tests/stack-turn.test.ts ${randomUUID()}`;

describe("A run's turn on the shared local stack", () => {
  const turns: StackTurn[] = [];
  const take = async (...args: Parameters<typeof takeStackTurn>) => {
    const turn = await takeStackTurn(...args);
    turns.push(turn);
    return turn;
  };

  afterEach(async () => {
    await Promise.all(turns.splice(0).map((turn) => turn.release()));
  });

  it('is taken at once when no other run holds it', async () => {
    const waits: string[] = [];
    await take(inject('supabaseDbUrl'), {
      key: ownKey(),
      onWait: (message) => waits.push(message),
    });
    expect(waits).toEqual([]);
  });

  it('waits for another run to finish, saying so, and then is taken', async () => {
    const key = ownKey();
    const first = await take(inject('supabaseDbUrl'), {
      key,
      holder: 'first run',
    });
    const waits: string[] = [];
    const second = takeStackTurn(inject('supabaseDbUrl'), {
      key,
      onWait: (message) => waits.push(message),
    });

    await expect.poll(() => waits).toHaveLength(1);
    expect(waits[0]).toContain('first run');
    await first.release();
    turns.push(await second);
  });

  it('fails, naming the run that holds it, once the wait runs out', async () => {
    const key = ownKey();
    await take(inject('supabaseDbUrl'), { key, holder: 'stuck run' });

    await expect(
      takeStackTurn(inject('supabaseDbUrl'), { key, waitMs: 500 }),
    ).rejects.toThrow(/stuck run/);
  });
});
