import type { Database } from './database.types';

/*
 * The Condition scale of CONTEXT.md: the raw-card state of a Copy, best
 * first. The database holds the abbreviation, because that is what
 * collectors write, and the screen shows it on a chip with the words beside
 * it, so a Trader who does not know the scale is never guessing at "MP".
 *
 * The names are keyed by the database's own enum, so a Condition added to
 * the scale does not compile until it is given words here.
 */

export type Condition = Database['public']['Enums']['card_condition'];

export const CONDITION_NAMES: Record<Condition, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DMG: 'Damaged',
};

/** The scale in order, best first, which is the order the chips sit in. */
export const CONDITIONS = Object.keys(CONDITION_NAMES) as Condition[];
