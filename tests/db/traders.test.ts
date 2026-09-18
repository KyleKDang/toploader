import { beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  cityId,
  ORANGE_COUNTY,
  seedAdversarialTraders,
  seedTrader,
  signUpTrader,
  type Client,
  type SeededTrader,
} from './seed.ts';

describe('A new Trader', () => {
  it('gets a Trader row the moment they sign up, with no profile set yet', async () => {
    const trader = await signUpTrader();

    expect(await readProfile(trader.client, trader.id)).toEqual({
      display_name: null,
      city_id: null,
      verified_at: null,
      banned_at: null,
      completed_trade_count: 0,
      adult_attested_at: null,
    });
  });

  it('sets their own display name and City, attesting to being 18 or over', async () => {
    const trader = await signUpTrader();
    const orangeCounty = await cityId(trader.client, ORANGE_COUNTY);

    const { error } = await trader.client.rpc('set_trader_profile', {
      display_name: '  Misty  ',
      city_id: orangeCounty,
      attests_adult: true,
    });

    expect(error).toBeNull();
    const profile = await readProfile(trader.client, trader.id);
    expect(profile.display_name).toBe('Misty');
    expect(profile.city_id).toBe(orangeCounty);
    expect(profile.adult_attested_at).not.toBeNull();
  });

  it('keeps the time of their first attestation when the profile is set again', async () => {
    const trader = await seedTrader('Misty');
    const first = await readProfile(trader.client, trader.id);

    await trader.client.rpc('set_trader_profile', {
      display_name: 'Misty W',
      city_id: await cityId(trader.client, ORANGE_COUNTY),
      attests_adult: true,
    });

    const second = await readProfile(trader.client, trader.id);
    expect(second.display_name).toBe('Misty W');
    expect(second.adult_attested_at).toBe(first.adult_attested_at);
  });

  it('cannot set a profile without attesting to being 18 or over', async () => {
    const trader = await signUpTrader();

    const { error } = await trader.client.rpc('set_trader_profile', {
      display_name: 'Misty',
      city_id: await cityId(trader.client, ORANGE_COUNTY),
      attests_adult: false,
    });

    expect(error?.code).toBe('22023');
    expect(await readProfile(trader.client, trader.id)).toMatchObject({
      display_name: null,
      city_id: null,
      adult_attested_at: null,
    });
  });

  it('cannot set a blank display name', async () => {
    const trader = await signUpTrader();

    const { error } = await trader.client.rpc('set_trader_profile', {
      display_name: '   ',
      city_id: await cityId(trader.client, ORANGE_COUNTY),
      attests_adult: true,
    });

    expect(error?.code).toBe('23514');
  });

  it('cannot pick a City that does not exist', async () => {
    const trader = await signUpTrader();

    const { error } = await trader.client.rpc('set_trader_profile', {
      display_name: 'Misty',
      city_id: crypto.randomUUID(),
      attests_adult: true,
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

  it('shows its display name and City to a foreign Trader', async () => {
    const { data, error } = await foreign.client
      .from('traders')
      .select('display_name, city_id')
      .eq('id', actor.id)
      .single();

    expect(error).toBeNull();
    expect(data).toEqual({
      display_name: actor.displayName,
      city_id: await cityId(foreign.client, ORANGE_COUNTY),
    });
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
      .select('trader_id, adult_attested_at');

    expect(data).toEqual([
      { trader_id: actor.id, adult_attested_at: expect.any(String) as string },
    ]);
  });

  it('cannot have its display name or City changed by a foreign Trader', async () => {
    const before = await readProfile(actor.client, actor.id);

    const renamed = await foreign.client
      .from('traders')
      .update({ display_name: 'Hijacked' })
      .eq('id', actor.id);
    const moved = await foreign.client
      .from('traders')
      .update({ city_id: null })
      .eq('id', actor.id);

    expect(renamed.error?.code).toBe('42501');
    expect(moved.error?.code).toBe('42501');
    expect(await readProfile(actor.client, actor.id)).toEqual(before);
  });

  it('is changed by set_trader_profile only for the calling Trader', async () => {
    const other = await seedTrader('Other');
    const before = await readProfile(actor.client, actor.id);

    const { error } = await other.client.rpc('set_trader_profile', {
      display_name: 'Renamed Other',
      city_id: await cityId(other.client, ORANGE_COUNTY),
      attests_adult: true,
    });

    expect(error).toBeNull();
    expect(await readProfile(actor.client, actor.id)).toEqual(before);
  });

  it('cannot be written directly, even by its owner', async () => {
    const before = await readProfile(actor.client, actor.id);

    const renamed = await actor.client
      .from('traders')
      .update({ display_name: 'Direct' })
      .eq('id', actor.id);
    const verified = await actor.client
      .from('traders')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', actor.id);
    const attested = await actor.client
      .from('trader_private')
      .update({ adult_attested_at: null })
      .eq('trader_id', actor.id);
    const deleted = await actor.client
      .from('traders')
      .delete()
      .eq('id', actor.id);

    expect(renamed.error?.code).toBe('42501');
    expect(verified.error?.code).toBe('42501');
    expect(attested.error?.code).toBe('42501');
    expect(deleted.error?.code).toBe('42501');
    expect(await readProfile(actor.client, actor.id)).toEqual(before);
  });

  it('cannot be read or set by a signed-out visitor', async () => {
    const anon = anonClient();

    const profile = await anon.from('traders').select('display_name');
    const privateFields = await anon
      .from('trader_private')
      .select('adult_attested_at');
    const set = await anon.rpc('set_trader_profile', {
      display_name: 'Nobody',
      city_id: await cityId(actor.client, ORANGE_COUNTY),
      attests_adult: true,
    });

    expect(profile.error?.code).toBe('42501');
    expect(privateFields.error?.code).toBe('42501');
    expect(set.error?.code).toBe('42501');
  });
});

/** A Trader's profile as its owner sees it: public and private fields. */
async function readProfile(owner: Client, traderId: string) {
  const [profile, privateFields] = await Promise.all([
    owner
      .from('traders')
      .select(
        'display_name, city_id, verified_at, banned_at, completed_trade_count',
      )
      .eq('id', traderId)
      .single(),
    owner
      .from('trader_private')
      .select('adult_attested_at')
      .eq('trader_id', traderId)
      .single(),
  ]);
  if (profile.error) throw profile.error;
  if (privateFields.error) throw privateFields.error;
  return { ...profile.data, ...privateFields.data };
}
