import { createClient } from '@supabase/supabase-js';

/*
 * Account deletion: the body of the `delete_account` edge function. It runs
 * in Node too, which is how the seam-2 suite proves it against the local
 * stack. So: supabase-js, and nothing that is only in one runtime.
 *
 * It is an edge function rather than an RPC because both of its steps leave
 * the database (ADR-0007): a file is deleted only through the Storage API,
 * and an account only through the Auth admin API, with the server-side key
 * neither a Trader nor a Postgres function running as one may hold.
 *
 * It takes no Trader id. Whose account goes is whoever's session the
 * request carries, so a Trader can only ever delete their own.
 *
 * The order is what makes it safe to fail. The verification documents go
 * first: if the run dies after them the account is whole and the Trader
 * asks again, and a request left waiting without its documents is a state
 * a Founder already knows how to clear (ADR-0007). The account goes last,
 * and takes everything in the database with it in one transaction: the
 * erasure is a trigger on the account's own deletion
 * (supabase/migrations/20260929120000_account_deletion.sql), so there is no
 * half-deleted Trader for a failure to leave behind.
 *
 * Listing photos are not this function's to delete. The erasure withdraws
 * the Trader's Listings, which hands their photos to the reaper
 * (scripts/photo-reaper), and leaves a traded Listing's alone: those are
 * the other Trader's Trade Record.
 */

const VERIFICATION_DOCUMENTS_BUCKET = 'verification-documents';

/** Storage lists and deletes a bounded number of files per request. */
const PAGE = 100;

/**
 * How many pages of documents one run will delete. A Trader holds a handful
 * of these at most; this is what stops a run that is somehow not making
 * progress from spinning until the function times out.
 */
const MAX_PAGES = 20;

export interface DeleteAccountOptions {
  supabaseUrl: string;
  /** The server-side key: the deletion runs as service_role. */
  supabaseSecretKey: string;
  /** The session the request came with, or null where it came with none. */
  accessToken: string | null;
}

/**
 * `deleted` once the account is gone, or `signed_out` where the request
 * carried no session Auth still honors, and so named nobody to delete.
 * Anything else is thrown: Storage or Auth failing, or the database
 * refusing the account, as it does a Founder's and a banned Trader's.
 */
export type DeleteAccountResult = 'deleted' | 'signed_out';

export async function deleteAccount({
  supabaseUrl,
  supabaseSecretKey,
  accessToken,
}: DeleteAccountOptions): Promise<DeleteAccountResult> {
  if (!accessToken) return 'signed_out';

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Asked of Auth rather than read off the token: Auth answers for a
  // session that still exists, where the token alone would go on saying yes
  // for an account already deleted.
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return 'signed_out';
  const traderId = data.user.id;

  // A Trader uploads under their own id (ADR-0001, amendment for #17), so
  // the prefix is everything of theirs in the bucket, whether a request
  // ever named it or not.
  const documents = supabase.storage.from(VERIFICATION_DOCUMENTS_BUCKET);
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const listed = await documents.list(traderId, { limit: PAGE });
    if (listed.error) throw listed.error;
    if (listed.data.length === 0) break;

    const removed = await documents.remove(
      listed.data.map((file) => `${traderId}/${file.name}`),
    );
    if (removed.error) throw removed.error;
  }

  const deleted = await supabase.auth.admin.deleteUser(traderId);
  if (deleted.error) throw deleted.error;

  return 'deleted';
}
