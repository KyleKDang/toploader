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

const FALLBACK = 'Something went wrong. Check your connection and try again.';

export function messageForTrader(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return (typeof code === 'string' && MESSAGES[code]) || FALLBACK;
}
