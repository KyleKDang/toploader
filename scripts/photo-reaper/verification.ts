import { reaperClient, sweepUnreferenced, type ReapOptions } from './sweep.ts';

/*
 * The photo reaper's verification pass: deletes the verification documents that
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

/**
 * How long an upload has to be named by a request before it counts as
 * abandoned. Submitting follows the uploads within seconds, so an hour is
 * generous, and with the reaper running daily it is what bounds how long an
 * abandoned document is held: a little over a day, so the Privacy Policy
 * can promise two (docs/operations.md).
 */
const GRACE_HOURS = 1;

/** Deletes the abandoned documents, and returns how many files went. */
export async function reapVerificationDocuments(
  options: ReapOptions,
): Promise<number> {
  return sweepUnreferenced(reaperClient(options), {
    bucket: 'verification-documents',
    rpc: 'unreferenced_verification_documents',
    graceHours: GRACE_HOURS,
  });
}
