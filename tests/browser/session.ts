import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types.ts';

/*
 * Signing a Trader into the app under test without walking the sign-up
 * screens, for a tracer whose flow starts after Onboarding. The Trader signs
 * up through real Auth on the local stack, and their real session is planted
 * where supabase-js in the page will find it.
 */

/** supabase-js's default storage key: `sb-` and the API host's first label. */
export function authStorageKey() {
  return `sb-${new URL(requireEnv('SUPABASE_API_URL')).hostname.split('.')[0]}-auth-token`;
}

/**
 * Signs a new Trader, onboarded in `city`, into the page, and hands back
 * their id, display name, and a client holding the same session, for a
 * tracer that has to check what the app stored as the Trader who stored it.
 *
 * A tracer that reads a City-scoped screen passes its own `displayName`.
 * Playwright runs these files in parallel against one stack, so another
 * tracer's Listing is legitimately in this Trader's City, and a name of
 * one's own is what tells the two apart.
 */
export async function signInAsNewTrader(
  page: Page,
  city: string,
  displayName = 'Priya R.',
) {
  const client = createClient<Database>(
    requireEnv('SUPABASE_API_URL'),
    requireEnv('SUPABASE_PUBLISHABLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signUp({
    email: `trader-${randomUUID()}@example.test`,
    password: randomUUID(),
  });
  if (error) throw error;
  if (!data.session) throw new Error('Signup returned no session');

  const { data: found, error: cityError } = await client
    .from('cities')
    .select('id')
    .eq('name', city)
    .single();
  if (cityError) throw cityError;
  const { error: profileError } = await client.rpc('set_trader_profile', {
    display_name: displayName,
    city_id: found.id,
    attests_adult: true,
  });
  if (profileError) throw profileError;

  await page.goto('/sign-up');
  await page.evaluate(
    ([key, session]) => localStorage.setItem(key, session),
    [authStorageKey(), JSON.stringify(data.session)],
  );

  return { id: data.user?.id ?? '', displayName, client };
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `${name} is missing; run this through playwright.config.ts`,
    );
  return value;
}
