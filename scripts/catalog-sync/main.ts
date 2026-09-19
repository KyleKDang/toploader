import { syncCatalog } from './sync.ts';

/*
 * The daily Catalog sync, as .github/workflows/catalog-sync.yml runs it:
 *
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/catalog-sync/main.ts
 *
 * Exits non-zero if any set failed, so the run reads as failed and Sentry
 * hears about it, though every other set was still applied.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

const report = await syncCatalog({
  supabaseUrl: required('SUPABASE_URL'),
  supabaseSecretKey: required('SUPABASE_SECRET_KEY'),
  tcgcsvBaseUrl: 'https://tcgcsv.com/tcgplayer/3',
  // TCGCSV publishes around 20:00 UTC and this runs after it, so today's UTC
  // date is the day these prices belong to.
  asOf: new Date().toISOString().slice(0, 10),
  pauseMs: 250,
});

console.log(`Applied ${report.applied.length} sets.`);
for (const { groupId, reason } of report.failed) {
  console.error(`Set ${groupId} failed: ${reason}`);
}
if (report.failed.length > 0) process.exitCode = 1;
