import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { inject } from 'vitest';
import type { Database } from '../../src/lib/database.types.ts';

export type Client = SupabaseClient<Database>;

export interface SeededTrader {
  id: string;
  email: string;
  displayName: string;
  client: Client;
}

export const ORANGE_COUNTY = 'Orange County';

/** A client with no session: the anon role, as a signed-out visitor. */
export function anonClient(): Client {
  return createClient<Database>(
    inject('supabaseUrl'),
    inject('supabasePublishableKey'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * A new Trader who signed up with email through real Auth and whose client
 * holds their session. The profile is left exactly as signup leaves it.
 */
export async function signUpTrader(): Promise<
  Omit<SeededTrader, 'displayName'>
> {
  const client = anonClient();
  const email = `trader-${randomUUID()}@example.test`;
  const { data, error } = await client.auth.signUp({
    email,
    password: randomUUID(),
  });
  if (error) throw error;
  if (!data.user || !data.session) {
    throw new Error('Signup returned no session; are email confirmations on?');
  }
  return { id: data.user.id, email, client };
}

export async function cityId(client: Client, name: string): Promise<string> {
  const { data, error } = await client
    .from('cities')
    .select('id')
    .eq('name', name)
    .single();
  if (error) throw error;
  return data.id;
}

/** A signed-up Trader who has also set a display name and picked a City. */
export async function seedTrader(displayName: string): Promise<SeededTrader> {
  const trader = await signUpTrader();
  const { error } = await trader.client.rpc('set_trader_profile', {
    display_name: displayName,
    city_id: await cityId(trader.client, ORANGE_COUNTY),
  });
  if (error) throw error;
  return { ...trader, displayName };
}

/**
 * The default shape of a seam-1 test: the Trader acting, the counterparty
 * they deal with, and a foreign Trader who is party to nothing and must be
 * denied. Every call seeds fresh Traders, so test files never share state.
 */
export async function seedAdversarialTraders(): Promise<{
  actor: SeededTrader;
  counterparty: SeededTrader;
  foreign: SeededTrader;
}> {
  const [actor, counterparty, foreign] = await Promise.all([
    seedTrader('Actor'),
    seedTrader('Counterparty'),
    seedTrader('Foreign'),
  ]);
  return { actor, counterparty, foreign };
}
