import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types.ts';

/*
 * The Listing photo reaper: gives back the Storage that withdrawn Listings
 * and abandoned uploads are holding.
 *
 * The free tier's 1 GB holds roughly 4,300 photos (ADR-0006), and two things
 * spend it without ever being looked at again: a Listing its Trader has
 * taken down, and a photo uploaded by a Trader who then closed the tab
 * before creating the Listing. Nothing else is reclaimable - and in
 * particular the photos of a Listing that went through a Trade are never
 * touched, because they are the Trade Record's evidence.
 *
 * That last rule does not need a check of its own. A Listing can only be
 * withdrawn from active, so one that reached `traded` was never withdrawn,
 * and reaping strictly what is withdrawn cannot reach it. The lifecycle
 * trigger is what makes that true, and tests/db/listings.test.ts is what
 * proves it.
 *
 * It runs as a scheduled job rather than an edge function for the same
 * reason the Catalog sync does: this repo already schedules jobs, and this
 * one needs no edge of its own.
 */

const BUCKET = 'listing-photos';

/** How long an upload has to become a Listing before it counts as abandoned. */
const ORPHAN_GRACE_HOURS = 24;

/** Storage takes a bounded list of paths per delete. */
const DELETE_BATCH = 100;

/**
 * How much of each work list a run takes at a time. PostgREST caps a
 * response at `max_rows` anyway (1000, in supabase/config.toml), so a run
 * that did not page would silently leave the rest of a backlog behind and
 * call itself done. Under this it just keeps asking until there is nothing
 * left.
 */
const PAGE = 500;

/**
 * How many pages of each list one run will take. It is a stop, not a budget:
 * the loops end when a page comes back empty, and this is what keeps a run
 * that is somehow not making progress - a file Storage accepts a delete for
 * but keeps - from spinning until the job times out. Whatever is left is
 * still there tomorrow.
 */
const MAX_PAGES = 100;

export interface ReapOptions {
  supabaseUrl: string;
  /** The server-side key: the reaper runs as service_role. */
  supabaseSecretKey: string;
}

export interface ReapReport {
  /** Withdrawn Listings whose photos were reclaimed. */
  listings: number;
  /** Files deleted, counting a photo and its thumbnail separately. */
  files: number;
  /** Of those, uploads that never became a Listing. */
  orphans: number;
}

export async function reapListingPhotos({
  supabaseUrl,
  supabaseSecretKey,
}: ReapOptions): Promise<ReapReport> {
  const supabase = createClient<Database>(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const report: ReapReport = { listings: 0, files: 0, orphans: 0 };

  // Withdrawn Listings, a page at a time. Each page is deleted before the
  // next is asked for, so the query keeps returning fresh work rather than
  // paging past rows this run has already forgotten.
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data: withdrawn, error } = await supabase
      .from('listing_photos')
      .select('id, listing_id, path, thumbnail_path, listings!inner(status)')
      .eq('listings.status', 'withdrawn')
      .limit(PAGE);
    if (error) throw error;
    if (withdrawn.length === 0) break;

    // The files go first. If the run dies between the two, the next one
    // finds the same rows and deletes files that are already gone, which
    // Storage accepts; the other order would leave files nothing remembers.
    await deleteFiles(
      supabase,
      withdrawn.flatMap(({ path, thumbnail_path }) => [path, thumbnail_path]),
    );

    const forgotten = await supabase
      .from('listing_photos')
      .delete()
      .in(
        'id',
        withdrawn.map(({ id }) => id),
      );
    if (forgotten.error) throw forgotten.error;

    report.listings += new Set(
      withdrawn.map(({ listing_id }) => listing_id),
    ).size;
    report.files += withdrawn.length * 2;
  }

  // Uploads no Listing ever named. A Trader may only write under their own
  // prefix, but nothing stops them writing and walking away, so without this
  // the bucket has a leak no policy can close.
  const olderThan = new Date(Date.now() - ORPHAN_GRACE_HOURS * 60 * 60 * 1000);
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data: orphans, error } = await supabase
      .rpc('unreferenced_listing_photos', {
        uploaded_before: olderThan.toISOString(),
      })
      .limit(PAGE);
    if (error) throw error;
    if (orphans.length === 0) break;

    await deleteFiles(
      supabase,
      orphans.map(({ path }) => path),
    );
    report.files += orphans.length;
    report.orphans += orphans.length;
  }

  return report;
}

type Supabase = ReturnType<typeof createClient<Database>>;

async function deleteFiles(supabase: Supabase, paths: string[]) {
  for (let from = 0; from < paths.length; from += DELETE_BATCH) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .remove(paths.slice(from, from + DELETE_BATCH));
    if (error) throw error;
  }
}
