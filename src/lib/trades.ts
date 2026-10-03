import type { TradeDetail, TradeListing } from './queries';

/*
 * A Trade read from the viewing Trader's side.
 *
 * The database stores a Trade by role - proposer and recipient, and whose
 * answer it waits on - because the roles are fixed while the turn moves.
 * A Trader reads it by side instead: what they give, what they get, and
 * whether it is their move. Every Trade screen reads it through here, so
 * "you" means the same thing on all of them.
 */

type TradeRoles = Pick<
  TradeDetail,
  | 'status'
  | 'proposer_id'
  | 'responder_id'
  | 'proposer_cash_cents'
  | 'recipient_cash_cents'
  | 'proposer'
  | 'recipient'
>;

/** A Trader as a Trade names them: who, and their Reputation basics. */
export type TradeTrader = TradeDetail['proposer'];

/**
 * A Trader's name as a Trade screen says it. A profile with no display name
 * cannot be traded with (onboarding sets one), so this is a fallback only.
 */
export function traderName(trader: Pick<TradeTrader, 'display_name'>) {
  return trader.display_name ?? 'another trader';
}

/** The other Trader of a Trade. */
export function otherTraderOf(trade: TradeRoles, traderId: string) {
  return trade.proposer_id === traderId ? trade.recipient : trade.proposer;
}

/** The cash each side brings, in cents, from the viewing Trader's side. */
export function cashOf(trade: TradeRoles, traderId: string) {
  const proposing = trade.proposer_id === traderId;
  return {
    give: proposing ? trade.proposer_cash_cents : trade.recipient_cash_cents,
    get: proposing ? trade.recipient_cash_cents : trade.proposer_cash_cents,
  };
}

/** The Listings on the table, split by which side gives them. */
export function sidesOf(listings: TradeListing[], traderId: string) {
  return {
    give: listings.filter((listing) => listing.trader_id === traderId),
    get: listings.filter((listing) => listing.trader_id !== traderId),
  };
}

/**
 * What one side of a Trade comes to at Market Price: its Listings' Variants
 * plus any cash. A Card the Catalog has no price for adds nothing, and is
 * counted so the screen can say so rather than silently valuing it at zero.
 */
export function sideValue(listings: TradeListing[], cashCents: number | null) {
  let cents = cashCents ?? 0;
  let unpriced = 0;
  for (const listing of listings) {
    const price = listing.card_variants.market_price_cents;
    if (price === null) unpriced += 1;
    else cents += price;
  }
  return { cents, unpriced };
}

/** Whether a Trade is waiting on this Trader's answer. */
export function isTradersTurn(trade: TradeRoles, traderId: string) {
  return trade.status === 'proposed' && trade.responder_id === traderId;
}

/** A Trade's state as a label, for a badge. */
export const STATUS_LABELS: Record<TradeDetail['status'], string> = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  declined: 'Declined',
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

/**
 * Where a Trade stands and whose move it is, in the few words the third line
 * of a Trades list row has room for beside a Reputation pill. The row's
 * title already names the other Trader, so "their" is enough.
 */
export function whoseMove(trade: TradeRoles, traderId: string): string {
  if (trade.status !== 'proposed') return STATUS_LABELS[trade.status];
  return isTradersTurn(trade, traderId) ? 'Your move' : 'Their move';
}
