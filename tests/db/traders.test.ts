import { beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  cityId,
  ORANGE_COUNTY,
  seedAdversarialTraders,
  signUpTrader,
  type SeededTrader,
} from './traders.ts';

describe('A new Trader', () => {
  it('gets a Trader row the moment they sign up, with no profile set yet', async () => {
    const trader = await signUpTrader();

    const profile = await trader.client
      .from('traders')
      .select('display_name, verified_at, banned_at, completed_trade_count')
      .eq('id', trader.id)
      .single();
    const secret = await trader.client
      .from('trader_private')
      .select('city_id')
      .eq('trader_id', trader.id)
      .single();

    expect(profile.error).toBeNull();
    expect(profile.data).toEqual({
      display_name: null,
      verified_at: null,
      banned_at: null,
      completed_trade_count: 0,
    });
    expect(secret.error).toBeNull();
    expect(secret.data).toEqual({ city_id: null });
  });

  it('sets their own display name and City', async () => {
    const trader = await signUpTrader();
    const orangeCounty = await cityId(trader.client, ORANGE_COUNTY);

    const { error } = await trader.client.rpc('set_trader_profile', {
      display_name: '  Misty  ',
      city_id: orangeCounty,
    });

    expect(error).toBeNull();
    const profile = await trader.client
      .from('traders')
      .select('display_name')
      .eq('id', trader.id)
      .single();
    const secret = await trader.client
      .from('trader_private')
      .select('city_id')
      .eq('trader_id', trader.id)
      .single();
    expect(profile.data?.display_name).toBe('Misty');
    expect(secret.data?.city_id).toBe(orangeCounty);
  });

  it('cannot set a blank display name', async () => {
    const trader = await signUpTrader();

    const { error } = await trader.client.rpc('set_trader_profile', {
      display_name: '   ',
      city_id: await cityId(trader.client, ORANGE_COUNTY),
    });

    expect(error?.code).toBe('23514');
  });

  it('cannot pick a City that does not exist', async () => {
    const trader = await signUpTrader();

    const { error } = await trader.client.rpc('set_trader_profile', {
      display_name: 'Misty',
      city_id: crypto.randomUUID(),
    });

    expect(error?.code).toBe('23503');
  });
});

describe('A Trader profile', () => {
  let actor: SeededTrader;
  let foreign: SeededTrader;

  beforeAll(async () => {
    ({ actor, foreign } = await seedAdversarialTraders());
  });

  it('shows its public fields to a foreign Trader', async () => {
    const { data, error } = await foreign.client
      .from('traders')
      .select('display_name')
      .eq('id', actor.id)
      .single();

    expect(error).toBeNull();
    expect(data?.display_name).toBe(actor.displayName);
  });

  it('hides its private fields from a foreign Trader', async () => {
    const { data, error } = await foreign.client
      .from('trader_private')
      .select('*')
      .eq('trader_id', actor.id);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('shows the owner their own private fields', async () => {
    const { data } = await actor.client
      .from('trader_private')
      .select('trader_id, city_id');

    expect(data).toEqual([
      {
        trader_id: actor.id,
        city_id: await cityId(actor.client, ORANGE_COUNTY),
      },
    ]);
  });

  it('cannot have its display name changed by a foreign Trader', async () => {
    const { error } = await foreign.client
      .from('traders')
      .update({ display_name: 'Hijacked' })
      .eq('id', actor.id);

    expect(error?.code).toBe('42501');
    await expectProfileUnchanged(actor);
  });

  it('cannot have its City changed by a foreign Trader', async () => {
    const { error } = await foreign.client
      .from('trader_private')
      .update({ city_id: null })
      .eq('trader_id', actor.id);

    expect(error?.code).toBe('42501');
    await expectProfileUnchanged(actor);
  });

  it('is changed through set_trader_profile only for the calling Trader', async () => {
    const { error } = await foreign.client.rpc('set_trader_profile', {
      display_name: 'Renamed Foreign',
      city_id: await cityId(foreign.client, ORANGE_COUNTY),
    });

    expect(error).toBeNull();
    await expectProfileUnchanged(actor);
  });

  it('cannot be written directly, even by its owner', async () => {
    const renamed = await actor.client
      .from('traders')
      .update({ display_name: 'Direct' })
      .eq('id', actor.id);
    const verified = await actor.client
      .from('traders')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', actor.id);
    const inserted = await actor.client
      .from('trader_private')
      .insert({ trader_id: actor.id });
    const deleted = await actor.client
      .from('traders')
      .delete()
      .eq('id', actor.id);

    expect(renamed.error?.code).toBe('42501');
    expect(verified.error?.code).toBe('42501');
    expect(inserted.error?.code).toBe('42501');
    expect(deleted.error?.code).toBe('42501');
    await expectProfileUnchanged(actor);
  });

  it('is not readable by a signed-out visitor', async () => {
    const anon = anonClient();

    const profile = await anon.from('traders').select('display_name');
    const secret = await anon.from('trader_private').select('city_id');
    const write = await anon.rpc('set_trader_profile', {
      display_name: 'Nobody',
      city_id: await cityId(actor.client, ORANGE_COUNTY),
    });

    expect(profile.error?.code).toBe('42501');
    expect(secret.error?.code).toBe('42501');
    expect(write.error?.code).toBe('42501');
  });
});

async function expectProfileUnchanged(trader: SeededTrader) {
  const profile = await trader.client
    .from('traders')
    .select('display_name, verified_at')
    .eq('id', trader.id)
    .single();
  const secret = await trader.client
    .from('trader_private')
    .select('city_id')
    .eq('trader_id', trader.id)
    .single();
  expect(profile.data).toEqual({
    display_name: trader.displayName,
    verified_at: null,
  });
  expect(secret.data?.city_id).toBe(await cityId(trader.client, ORANGE_COUNTY));
}
