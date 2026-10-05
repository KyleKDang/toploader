import { createClient } from '@supabase/supabase-js';

/*
 * Banning: the body of the `ban_trader` edge function. It runs in Node too,
 * which is how the seam-2 suite proves it against the local stack. So:
 * supabase-js, and nothing that is only in one runtime.
 *
 * It is an edge function rather than an RPC because the ban itself is in
 * Auth (ADR-0007): an account is banned only through the Auth admin API,
 * with the server-side key neither a Trader nor a Postgres function running
 * as one may hold. The Auth ban is what keeps the Trader from signing in
 * again or refreshing a session.
 *
 * Everything the ban does in the database - the public mark, the Listings
 * withdrawn, the open Trades ended - is a trigger on the account's ban
 * (supabase/migrations/20261006120000_ban.sql), so it is one transaction
 * with it, and this function has nothing to leave half-done.
 */

/**
 * How long a ban lasts. Auth takes a duration rather than "for good", so a
 * hundred years stands in for it; the mark in the database does not expire
 * either way.
 */
export const FOR_GOOD = '876000h';

export interface BanTraderOptions {
  supabaseUrl: string;
  /** The server-side key: the ban runs as service_role. */
  supabaseSecretKey: string;
  /** The session the request came with, or null where it came with none. */
  accessToken: string | null;
  /** The Trader to ban, as the request named them. */
  traderId: unknown;
}

/**
 * `banned` once the account is banned; `signed_out` where the request
 * carried no session Auth still honors; `forbidden` where the caller is not
 * a Founder; or `refused` where the Trader named cannot be banned: a
 * Founder, a deleted account, or nobody at all. Auth failing is thrown.
 */
export type BanTraderResult = 'banned' | 'signed_out' | 'forbidden' | 'refused';

/** What Postgres raises each refusal with. */
const NOT_A_FOUNDER = '42501';
const NOT_BANNABLE = '22023';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function banTrader({
  supabaseUrl,
  supabaseSecretKey,
  accessToken,
  traderId,
}: BanTraderOptions): Promise<BanTraderResult> {
  if (!accessToken) return 'signed_out';

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Asked of Auth rather than read off the token, for the reason
  // delete-account.ts gives: Auth answers for a session that still exists.
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return 'signed_out';

  // A malformed id names nobody, and says nothing about who exists.
  if (typeof traderId !== 'string' || !UUID.test(traderId)) return 'refused';

  // Asked with the caller's Trader id, since this runs as service_role,
  // which is_founder() has no caller to ask about. Not a Founder is
  // refused before the Trader named is looked at, so the answer tells a
  // Trader nothing about who exists.
  const allowed = await supabase.rpc('require_ban_allowed', {
    caller_id: data.user.id,
    trader_id: traderId,
  });
  if (allowed.error) {
    if (allowed.error.code === NOT_A_FOUNDER) return 'forbidden';
    if (allowed.error.code === NOT_BANNABLE) return 'refused';
    throw allowed.error;
  }

  const banned = await supabase.auth.admin.updateUserById(traderId, {
    ban_duration: FOR_GOOD,
  });
  if (banned.error) throw banned.error;

  return 'banned';
}
