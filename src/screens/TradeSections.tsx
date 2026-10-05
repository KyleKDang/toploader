import { useId } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Button,
  CardTile,
  ListRow,
  ReputationPill,
  ShieldIcon,
} from '../components';
import { formatPrice } from '../lib/format';
import type { TradeListing } from '../lib/queries';
import { sideValue, traderName, type TradeTrader } from '../lib/trades';

/*
 * The pieces a Trade's terms are drawn with, shared by the proposal picker
 * and the Trade page so the two read as the same terms: one section per side
 * with its total at Market Price, a row per Listing, a row for cash, and the
 * balance strip under both, as the chosen mockup draws them.
 *
 * Prices are the Variant's Market Price, the one reference both sides share,
 * the same reason the Matches view gives for showing it.
 */

/**
 * The top bar's line naming the other Trader, with their Reputation. The
 * name truncates and the pill does not: a long name would otherwise push
 * the pill off the end of the line, and it is the part that says who they
 * are to trade with.
 */
export function OtherTraderLine({
  prefix,
  trader,
}: {
  prefix: string;
  trader: TradeTrader;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">
        {prefix} {traderName(trader)}
      </span>
      <ReputationPill
        verified={trader.verified_at !== null}
        banned={trader.banned_at !== null}
        trades={trader.completed_trade_count}
      />
    </span>
  );
}

/**
 * One side of a Trade - "You give" or "You get" - as a named region, with
 * what it comes to at Market Price beside the heading.
 */
export function TradeSide({
  title,
  listings,
  cashCents,
  children,
}: {
  title: string;
  listings: TradeListing[];
  cashCents: number | null;
  children: ReactNode;
}) {
  const headingId = useId();
  const { cents } = sideValue(listings, cashCents);

  return (
    <section aria-labelledby={headingId} className="pt-4">
      <h2
        id={headingId}
        className="flex items-baseline justify-between gap-2.5 px-4 pb-1.5 text-base font-bold text-ink"
      >
        {title}
        <span className="tabular-nums">{formatPrice(cents)}</span>
      </h2>
      <ul className="border-t border-line">{children}</ul>
    </section>
  );
}

/**
 * A Listing on one side of a Trade. `leading` is what sits before the
 * thumbnail: the picker's checkbox. The thumbnail takes empty alt text for
 * the reason City browse gives: the row already names the Card and its
 * Condition.
 */
export function TradeListingRow({
  listing,
  leading,
  onClick,
}: {
  listing: TradeListing;
  leading?: ReactNode;
  onClick?: () => void;
}) {
  const variant = listing.card_variants;
  const card = variant.cards;

  return (
    <ListRow
      leading={
        <>
          {leading}
          <CardTile src={listing.thumbnailUrl} alt="" />
        </>
      }
      title={card.name}
      trailing={
        variant.market_price_cents === null ? null : (
          <span className="tabular-nums">
            {formatPrice(variant.market_price_cents)}
          </span>
        )
      }
      detail={`${variant.name} · ${listing.condition} · ${card.card_sets.name} ${card.number}`}
      onClick={onClick}
    />
  );
}

/** Cash on one side of a Trade, as a row among that side's Listings. */
export function CashRow({ from, cents }: { from: string; cents: number }) {
  return (
    <li>
      <ListRow
        title={`Cash from ${from}`}
        trailing={<span className="tabular-nums">{formatPrice(cents)}</span>}
        detail="Handed over in person at the meetup"
      />
    </li>
  );
}

/**
 * Which way the Trade leans at Market Price, from the viewing Trader's side,
 * and how many Cards on it the Catalog has no price for.
 */
export function TradeBalance({
  give,
  get,
}: {
  give: { listings: TradeListing[]; cashCents: number | null };
  get: { listings: TradeListing[]; cashCents: number | null };
}) {
  const given = sideValue(give.listings, give.cashCents);
  const got = sideValue(get.listings, get.cashCents);
  const difference = got.cents - given.cents;
  const unpriced = given.unpriced + got.unpriced;

  return (
    <div className="mx-4 mt-4 flex flex-col gap-1 rounded-md bg-surface-2 px-3.5 py-2.5">
      <p className="flex items-center justify-between gap-2.5 text-sm text-muted">
        At market price
        <strong className="text-base tabular-nums text-ink">
          {difference === 0
            ? 'Even'
            : difference > 0
              ? `You get ${formatPrice(difference)} more`
              : `You give ${formatPrice(-difference)} more`}
        </strong>
      </p>
      {unpriced > 0 ? (
        <p className="text-sm text-muted">
          {unpriced === 1
            ? '1 card has no market price and is not counted.'
            : `${unpriced} cards have no market price and are not counted.`}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Said under a Trade's terms when there is cash on them: the figure is what
 * the two Traders agreed, and the app never touches the money (ADR-0004).
 * The picker says the same in its cash field's hint instead.
 */
export function CashNote() {
  return (
    <p className="px-4 pt-2.5 text-xs leading-prose text-muted">
      Cash changes hands in person. The app never holds or moves money.
    </p>
  );
}

/**
 * What an unverified Trader sees where sending or accepting a proposal would
 * be: that it needs verification, before they tap, rather than a refusal
 * after, and the way to it.
 */
export function VerificationNeeded({ toDo }: { toDo: string }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-2 rounded-md border-2 border-line bg-surface p-4">
      <p className="flex items-center gap-2 text-base font-bold text-ink">
        <ShieldIcon />
        Verification required
      </p>
      <p className="text-sm leading-prose text-muted">
        Only verified traders can {toDo}. A founder checks your ID and a selfie
        once, then deletes both.
      </p>
      <div className="flex">
        <Button
          variant="primary"
          onClick={() => void navigate({ to: '/verification' })}
        >
          Get verified
        </Button>
      </div>
    </div>
  );
}
