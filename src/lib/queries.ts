import { queryOptions } from '@tanstack/react-query';
import { supabase } from './supabase';

/*
 * What the routes need to know about the signed-in Trader - who they are,
 * their profile, and whether it is set up - and the Cities to pick from.
 * Reads are TanStack Query options, so a route loader and a component share
 * one cache entry per read.
 */

/** The signed-in Trader's id, or null when nobody is signed in. */
export async function currentTraderId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user.id ?? null;
}

/** A Trader's public profile, with their City's name. */
export type TraderProfile = {
  display_name: string | null;
  city: { name: string } | null;
};

export function traderQuery(traderId: string) {
  return queryOptions({
    queryKey: ['trader', traderId],
    queryFn: async (): Promise<TraderProfile> => {
      const { data, error } = await supabase
        .from('traders')
        .select('display_name, city:cities(name)')
        .eq('id', traderId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Whether the Trader has finished onboarding. `set_trader_profile` sets the
 * display name and City together, and only with the 18-or-over attestation,
 * so a profile with both has all three.
 */
export function hasProfile(trader: TraderProfile) {
  return trader.display_name !== null && trader.city !== null;
}

/** Every City, in name order. Reference data, so never refetched. */
export const citiesQuery = queryOptions({
  queryKey: ['cities'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('cities')
      .select('id, name')
      .order('name');
    if (error) throw error;
    return data;
  },
  staleTime: Infinity,
});
