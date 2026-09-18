import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set; copy .env.example to .env.local.',
  );
}

/** The one client the app talks to Supabase through, signed in as the Trader. */
export const supabase = createClient<Database>(url, publishableKey);
