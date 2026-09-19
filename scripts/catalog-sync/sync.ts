import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types.ts';

/*
 * The Catalog sync (ADR-0003): pulls TCGCSV's daily files for every Pokemon
 * set and hands each set to the database, which owns the rules for what a
 * sync may change (apply_catalog_set). This side only fetches, checks that a
 * response is what it claims to be, and keeps what the Catalog stores.
 *
 * A set that fails, here or in the database, is skipped and reported, and its
 * last-good data stays as it was. The rest of the run carries on.
 */

export interface SyncOptions {
  supabaseUrl: string;
  /** The server-side key: the sync runs as service_role. */
  supabaseSecretKey: string;
  /** TCGCSV's Pokemon category, e.g. https://tcgcsv.com/tcgplayer/3 */
  tcgcsvBaseUrl: string;
  /** The day this run's prices are recorded against, as YYYY-MM-DD. */
  asOf: string;
  /** The pause between upstream requests; TCGCSV asks for gentle pacing. */
  pauseMs: number;
}

export interface SyncReport {
  /** TCGplayer group ids of the sets applied. */
  applied: number[];
  failed: { groupId: number; reason: string }[];
}

// TCGCSV's FAQ asks for a User-Agent that says who is calling.
const USER_AGENT =
  'toploader-catalog-sync/1.0 (+https://github.com/KyleKDang/toploader)';

interface Envelope<T> {
  success: boolean;
  errors: unknown[];
  results: T[];
}

interface Group {
  groupId: number;
  name: string;
  abbreviation: string | null;
  publishedOn: string | null;
}

interface Product {
  productId: number;
  name: string;
  imageUrl: string | null;
  extendedData: { name: string; value: string }[];
}

interface Price {
  productId: number;
  subTypeName: string;
  marketPrice: number | null;
}

export async function syncCatalog(options: SyncOptions): Promise<SyncReport> {
  const supabase = createClient<Database>(
    options.supabaseUrl,
    options.supabaseSecretKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let lastRequestAt = 0;
  async function fetchResults<T>(path: string): Promise<T[]> {
    const wait = lastRequestAt + options.pauseMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();

    const response = await fetch(`${options.tcgcsvBaseUrl}${path}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!response.ok) {
      throw new Error(`TCGCSV answered ${response.status} for ${path}`);
    }
    const envelope = (await response.json()) as Partial<Envelope<T>>;
    if (envelope.success !== true || !Array.isArray(envelope.results)) {
      throw new Error(
        `TCGCSV reported failure for ${path}: ${JSON.stringify(envelope.errors)}`,
      );
    }
    return envelope.results;
  }

  // Without the set list there is nothing to sync, so this one throws.
  const groups = await fetchResults<Group>('/groups');
  if (groups.length === 0) throw new Error('TCGCSV listed no sets');

  const report: SyncReport = { applied: [], failed: [] };
  for (const group of groups) {
    try {
      const products = await fetchResults<Product>(
        `/${group.groupId}/products`,
      );
      const prices = await fetchResults<Price>(`/${group.groupId}/prices`);
      const { error } = await supabase.rpc('apply_catalog_set', {
        card_set: {
          groupId: group.groupId,
          name: group.name,
          abbreviation: group.abbreviation,
          releasedOn: group.publishedOn?.slice(0, 10) ?? null,
        },
        cards: products.flatMap(toCard),
        prices: prices.map((price) => ({
          productId: price.productId,
          variant: price.subTypeName,
          marketPrice: price.marketPrice,
        })),
        sync_day: options.asOf,
      });
      if (error) throw new Error(error.message);
      report.applied.push(group.groupId);
    } catch (error) {
      report.failed.push({
        groupId: group.groupId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Thinning old history is part of a sync that landed. On a day nothing
  // could be applied, the database is left exactly as it was.
  if (report.applied.length > 0) {
    const { error } = await supabase.rpc('compact_price_snapshots', {
      sync_day: options.asOf,
    });
    if (error) throw new Error(error.message);
  }

  return report;
}

/** A product is a Card only if it has a collector number; the rest is sealed. */
function toCard(product: Product) {
  const field = (name: string) =>
    product.extendedData.find((entry) => entry.name === name)?.value ?? null;

  const number = field('Number');
  if (number === null) return [];

  // Modern sets name a Card "Greninja ex - 021/128".
  const suffix = ` - ${number}`;
  const name = product.name.endsWith(suffix)
    ? product.name.slice(0, -suffix.length)
    : product.name;

  return [
    {
      productId: product.productId,
      name,
      number,
      rarity: field('Rarity'),
      imageUrl: product.imageUrl,
    },
  ];
}
