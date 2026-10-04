import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types.ts';
import { deleteFiles, MAX_PAGES, PAGE } from './reap.ts';

/*
 * The photo reaper's second pass: deletes the verification documents that
 * no waiting request names (#88).
 *
 * A Trader's browser uploads the ID photo and the selfie and only then
 * submits the request that names them, so a Trader who closes the tab in
 * between leaves a government ID in the bucket that no Founder will review
 * and no review will delete. So does an account deleted from the dashboard
 * while its request waits. Holding strangers' IDs is the liability the
 * whole verification flow is built to avoid (docs/mvp-spec.md,
 * Verification), so whatever is not waiting on a review goes.
 *
 * A waiting request keeps its documents however long it waits, since a
 * Founder may not get to it for days.
 */

const BUCKET = 'verification-documents';

/**
 * How long an upload has to be named by a request before it counts as
 * abandoned. Submitting follows the uploads within seconds, so an hour is
 * generous, and with the reaper running daily it is what bounds how long an
 * abandoned document is held: a little over a day, so the Privacy Policy
 * can promise two (docs/operations.md).
 */
const GRACE_HOURS = 1;

export interface VerificationReapOptions {
  supabaseUrl: string;
  /** The server-side key: the reaper runs as service_role. */
  supabaseSecretKey: string;
}

/** Deletes the abandoned documents, and returns how many files went. */
export async function reapVerificationDocuments({
  supabaseUrl,
  supabaseSecretKey,
}: VerificationReapOptions): Promise<number> {
  const supabase = createClient<Database>(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let files = 0;
  const olderThan = new Date(Date.now() - GRACE_HOURS * 60 * 60 * 1000);
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data: abandoned, error } = await supabase
      .rpc('unreferenced_verification_documents', {
        uploaded_before: olderThan.toISOString(),
      })
      .limit(PAGE);
    if (error) throw error;
    if (abandoned.length === 0) break;

    await deleteFiles(
      supabase,
      BUCKET,
      abandoned.map(({ path }) => path),
    );
    files += abandoned.length;
  }

  return files;
}
