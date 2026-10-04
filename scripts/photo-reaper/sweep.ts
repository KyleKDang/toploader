import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types.ts';

/*
 * What the photo reaper's passes share: the service_role client, deleting
 * files through the Storage API, and the sweep of uploads no row names.
 *
 * Both buckets are written by the browser before the row that names the
 * file, so both can hold an upload nobody finished, and each answers the
 * question of which files those are with an RPC of the same shape.
 */

/** Storage takes a bounded list of paths per delete. */
const DELETE_BATCH = 100;

/**
 * How much of each work list a run takes at a time. PostgREST caps a
 * response at `max_rows` anyway (1000, in supabase/config.toml), so a run
 * that did not page would silently leave the rest of a backlog behind and
 * call itself done. Under this it just keeps asking until there is nothing
 * left.
 */
export const PAGE = 500;

/**
 * How many pages of each list one run will take. It is a stop, not a budget:
 * the loops end when a page comes back empty, and this is what keeps a run
 * that is somehow not making progress - a file Storage accepts a delete for
 * but keeps - from spinning until the job times out. Whatever is left is
 * still there tomorrow.
 */
export const MAX_PAGES = 100;

export interface ReapOptions {
  supabaseUrl: string;
  /** The server-side key: the reaper runs as service_role. */
  supabaseSecretKey: string;
}

type Supabase = ReturnType<typeof createClient<Database>>;

export function reaperClient({
  supabaseUrl,
  supabaseSecretKey,
}: ReapOptions): Supabase {
  return createClient<Database>(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function deleteFiles(
  supabase: Supabase,
  bucket: string,
  paths: string[],
) {
  for (let from = 0; from < paths.length; from += DELETE_BATCH) {
    const { error } = await supabase.storage
      .from(bucket)
      .remove(paths.slice(from, from + DELETE_BATCH));
    if (error) throw error;
  }
}

/** A bucket, and the RPC that lists the files in it no row names. */
export interface Unreferenced {
  bucket: string;
  rpc: 'unreferenced_listing_photos' | 'unreferenced_verification_documents';
  /** How long an upload has to be named before it counts as abandoned. */
  graceHours: number;
}

/** Deletes every abandoned upload, and returns how many files went. */
export async function sweepUnreferenced(
  supabase: Supabase,
  { bucket, rpc, graceHours }: Unreferenced,
): Promise<number> {
  const olderThan = new Date(Date.now() - graceHours * 60 * 60 * 1000);
  let files = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data: abandoned, error } = await supabase
      .rpc(rpc, { uploaded_before: olderThan.toISOString() })
      .limit(PAGE);
    if (error) throw error;
    if (abandoned.length === 0) break;

    await deleteFiles(
      supabase,
      bucket,
      abandoned.map(({ path }) => path),
    );
    files += abandoned.length;
  }
  return files;
}
