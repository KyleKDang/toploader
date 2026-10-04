import { reapListingPhotos } from './reap.ts';
import { reapVerificationDocuments } from './verification.ts';

/*
 * The daily photo reaper, verification documents and then Listing photos,
 * as .github/workflows/photo-reaper.yml runs it:
 *
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/photo-reaper/main.ts
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

const options = {
  supabaseUrl: required('SUPABASE_URL'),
  supabaseSecretKey: required('SUPABASE_SECRET_KEY'),
};

// The documents first: a government ID held past its time is the liability,
// so a Listing pass that fails must not stand in front of them.
const documentFiles = await reapVerificationDocuments(options);
console.log(
  `Deleted ${documentFiles} verification documents no waiting request names.`,
);

const report = await reapListingPhotos(options);

console.log(
  `Reclaimed ${report.files} files: ${report.listings} withdrawn Listings, ` +
    `${report.orphans} uploads that never became one.`,
);
