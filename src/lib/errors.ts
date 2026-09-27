/*
 * What a Trader reads when a request fails.
 *
 * Supabase's own messages ("Token has expired or is invalid", "display_name
 * and city_id are required") are written for developers and name columns
 * rather than the product's nouns, so the failures a Trader can cause or fix
 * are said here in the app's words. Anything else is a fault they cannot act
 * on, and gets the generic line.
 */

const MESSAGES: Record<string, string> = {
  // Auth error codes.
  otp_expired:
    'That code is wrong or has expired. Check it, or go back and send a new one.',
  over_email_send_rate_limit:
    'Too many codes sent to this email. Wait a few minutes, then try again.',
  over_request_rate_limit:
    'Too many attempts. Wait a few minutes, then try again.',
  email_address_invalid: 'That email address does not look right.',
  validation_failed: 'That email address does not look right.',
  // Postgres error codes raised by set_trader_profile.
  '23502': 'Add a display name and choose your area.',
  // Preparing a Listing photo for upload (src/lib/photos.ts).
  photo_unreadable:
    'That file is not a photo we can read. Take it again with your camera.',
  photo_no_webp:
    'This browser cannot prepare photos for upload. Try a different browser.',
};

/*
 * The Trade RPCs' refusals (supabase/migrations/20260926120000_trades.sql).
 * They share two Postgres codes between a dozen different reasons, so each
 * is known by the sentence the database raises it with rather than by its
 * code. A refusal the UI already prevents - cash on both sides, a Trade with
 * nothing on it - is still said here, since a stale screen can send one.
 */
const REFUSALS: Record<string, string> = {
  'a Listing on this Trade is no longer on offer':
    'A listing on this trade is no longer available. It may be in another trade, or its owner took it down.',
  'this Trade is not waiting on your answer':
    'This trade is not waiting on your answer anymore. It may have been answered already.',
  'a Trade can hold only active Listings of its two Traders':
    'A listing you picked is no longer available. Go back and pick again.',
  'only a Verified Trader can send or accept a Trade proposal':
    'Only verified traders can send or accept a trade.',
  'each side of a Trade must give a Listing or cash':
    'Each side of a trade has to give a listing or cash.',
  'a Trade needs at least one Listing': 'A trade needs at least one listing.',
  'cash can be on one side of a Trade, not both':
    'Cash can come from one side of a trade, not both.',
  'a cash amount must be more than zero':
    'A cash amount has to be more than zero.',
  'a Trade is proposed to another Trader of your City':
    'You can only trade with another trader in your area.',
  'a Trader can only act on a Trade they are party to':
    'That trade is not available.',
};

const FALLBACK = 'Something went wrong. Check your connection and try again.';

export function messageForTrader(error: unknown): string {
  const { code, message } = (error ?? {}) as {
    code?: unknown;
    message?: unknown;
  };
  return (
    (typeof message === 'string' && REFUSALS[message]) ||
    (typeof code === 'string' && MESSAGES[code]) ||
    FALLBACK
  );
}
