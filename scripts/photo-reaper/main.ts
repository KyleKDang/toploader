import { reapListingPhotos } from './reap.ts';

/*
 * The daily Listing photo reaper, as .github/workflows/photo-reaper.yml runs
 * it:
 *
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/photo-reaper/main.ts
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

const report = await reapListingPhotos({
  supabaseUrl: required('SUPABASE_URL'),
  supabaseSecretKey: required('SUPABASE_SECRET_KEY'),
});

console.log(
  `Reclaimed ${report.files} files: ${report.listings} withdrawn Listings, ` +
    `${report.orphans} uploads that never became one.`,
);
