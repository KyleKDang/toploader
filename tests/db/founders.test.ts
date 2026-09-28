import { describe, expect, it } from 'vitest';
import { makeFounder } from './arrange.ts';
import { anonClient, seedAdversarialTraders } from './seed.ts';

/*
 * A Founder is a Trader whose id is in `founders`, a table only a migration
 * can write (ADR-0007). Nothing a client can call grants the right, and
 * nothing a client can read lists who holds it: a Trader learns whether
 * they are a Founder themselves, and that is all.
 */

describe('Founders', () => {
  it('are told they are one, and every other Trader that they are not', async () => {
    const { actor: founder, foreign } = await seedAdversarialTraders();
    await makeFounder(founder.id);

    expect(await founder.client.rpc('is_founder')).toMatchObject({
      data: true,
      error: null,
    });
    expect(await foreign.client.rpc('is_founder')).toMatchObject({
      data: false,
      error: null,
    });
  });

  it('cannot be asked about by a signed-out visitor', async () => {
    const { error } = await anonClient().rpc('is_founder');

    expect(error?.code).toBe('42501');
  });

  it('cannot be listed by anyone, a Founder included', async () => {
    const { actor: founder, foreign } = await seedAdversarialTraders();
    await makeFounder(founder.id);

    for (const client of [founder.client, foreign.client, anonClient()]) {
      const { data, error } = await client.from('founders').select('*');

      expect(data).toBeNull();
      expect(error?.code).toBe('42501');
    }
  });

  it('cannot be made by a Trader, nor by a Founder', async () => {
    const { actor: founder, foreign } = await seedAdversarialTraders();
    await makeFounder(founder.id);

    for (const client of [founder.client, foreign.client]) {
      const { error } = await client
        .from('founders')
        .insert({ trader_id: foreign.id });

      expect(error?.code).toBe('42501');
    }
    expect(await foreign.client.rpc('is_founder')).toMatchObject({
      data: false,
    });
  });

  it('cannot be unmade by a Trader, nor by a Founder', async () => {
    const { actor: founder, foreign } = await seedAdversarialTraders();
    await makeFounder(founder.id);

    for (const client of [founder.client, foreign.client]) {
      const { error } = await client
        .from('founders')
        .delete()
        .eq('trader_id', founder.id);

      expect(error?.code).toBe('42501');
    }
    expect(await founder.client.rpc('is_founder')).toMatchObject({
      data: true,
    });
  });
});
