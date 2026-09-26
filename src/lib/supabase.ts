import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set; copy .env.example to .env.local.',
  );
}

/**
 * The one client the app talks to Supabase through, signed in as the Trader.
 *
 * Its own retries are off, so TanStack Query's are the only ones (src/main.tsx):
 * every read goes through a query, and two retry layers stacked would try a
 * failed read sixteen times, and hold a Trader who is offline on a blank
 * screen for most of a minute.
 */
export const supabase = createClient<Database>(url, publishableKey, {
  db: { retry: false },
});
