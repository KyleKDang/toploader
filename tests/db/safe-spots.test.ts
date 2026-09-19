import { beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  cityId,
  ORANGE_COUNTY,
  seedTrader,
  signUpTrader,
  TEST_CITY,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * The Safe Spot directory is reference data: seeded by migration in
 * production and by supabase/seed.sql on local and CI stacks, read by a
 * Trader for their own City only, and written by no client.
 */
describe('Safe Spots', () => {
  let actor: SeededTrader;
  let foreign: SeededTrader;

  beforeAll(async () => {
    [actor, foreign] = await Promise.all([
      seedTrader('Actor', ORANGE_COUNTY),
      seedTrader('Foreign', TEST_CITY),
    ]);
  });

  it('are listed for a Trader in their City, with name, address, kind, and notes', async () => {
    const orangeCounty = await cityId(actor.client, ORANGE_COUNTY);

    const spots = await readSafeSpots(actor.client);

    expect(spots.length).toBeGreaterThan(0);
    for (const spot of spots) {
      expect(spot).toEqual({
        id: expect.any(String) as string,
        city_id: orangeCounty,
        name: expect.any(String) as string,
        address: expect.any(String) as string,
        kind: expect.stringMatching(
          /^(police_station|monitored_site)$/,
        ) as string,
        notes: expect.toBeOneOf([expect.any(String), null]) as string | null,
      });
    }
  });

  it('of another City are hidden from a foreign Trader', async () => {
    const actorSpots = await readSafeSpots(actor.client);
    const testCity = await cityId(foreign.client, TEST_CITY);

    const foreignSpots = await readSafeSpots(foreign.client);

    expect(foreignSpots.length).toBeGreaterThan(0);
    expect(foreignSpots.every((spot) => spot.city_id === testCity)).toBe(true);
    const actorIds = new Set(actorSpots.map((spot) => spot.id));
    expect(foreignSpots.some((spot) => actorIds.has(spot.id))).toBe(false);
  });

  it('are hidden from a Trader who has not picked a City yet', async () => {
    const { client } = await signUpTrader();

    expect(await readSafeSpots(client)).toEqual([]);
  });

  it('are not readable by a signed-out visitor', async () => {
    const { data, error } = await anonClient().from('safe_spots').select('id');

    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
  });

  it('cannot be created, edited, or deleted by a Trader', async () => {
    const [spot] = await readSafeSpots(actor.client);
    if (!spot) throw new Error('Orange County has no seeded Safe Spot');

    const created = await actor.client.from('safe_spots').insert({
      city_id: spot.city_id,
      name: 'A Trader-made spot',
      address: '1 Anywhere St',
      kind: 'monitored_site',
    });
    const edited = await actor.client
      .from('safe_spots')
      .update({ address: '2 Elsewhere Ave' })
      .eq('id', spot.id);
    const deleted = await actor.client
      .from('safe_spots')
      .delete()
      .eq('id', spot.id);

    expect(created.error?.code).toBe('42501');
    expect(edited.error?.code).toBe('42501');
    expect(deleted.error?.code).toBe('42501');
    expect(await readSafeSpots(actor.client)).toContainEqual(spot);
  });
});

async function readSafeSpots(client: Client) {
  const { data, error } = await client
    .from('safe_spots')
    .select('id, city_id, name, address, kind, notes')
    .order('name');
  if (error) throw error;
  return data;
}
