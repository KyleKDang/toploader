import { beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  cityId,
  ORANGE_COUNTY,
  signUpTrader,
  type Client,
} from './traders.ts';

describe('Cities', () => {
  let trader: Client;

  beforeAll(async () => {
    ({ client: trader } = await signUpTrader());
  });

  it('includes Orange County, the launch City, for any signed-in Trader', async () => {
    const { data, error } = await trader.from('cities').select('name');

    expect(error).toBeNull();
    expect(data?.map((city) => city.name)).toContain(ORANGE_COUNTY);
  });

  it('are not readable by a signed-out visitor', async () => {
    const { data, error } = await anonClient().from('cities').select('name');

    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
  });

  it('cannot be created by a Trader', async () => {
    const { error } = await trader.from('cities').insert({ name: 'Gotham' });

    expect(error?.code).toBe('42501');
  });

  it('cannot be renamed or deleted by a Trader', async () => {
    const id = await cityId(trader, ORANGE_COUNTY);

    const renamed = await trader
      .from('cities')
      .update({ name: 'Gotham' })
      .eq('id', id);
    const deleted = await trader.from('cities').delete().eq('id', id);

    expect(renamed.error?.code).toBe('42501');
    expect(deleted.error?.code).toBe('42501');
    expect(await cityId(trader, ORANGE_COUNTY)).toBe(id);
  });
});
