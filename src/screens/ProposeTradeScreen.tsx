import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useNavigate, useRouter } from '@tanstack/react-router';
import {
  AppShell,
  Button,
  CheckboxBox,
  ChipGroup,
  EmptyState,
  FormError,
  TextInput,
  TopBar,
} from '../components';
import {
  counterTrade,
  proposeTrade,
  TRADES_KEY,
  type TradeListing,
  type TradeTerms,
} from '../lib/queries';
import { cashOf, isTradersTurn, otherTraderOf } from '../lib/trades';
import { useTabs } from '../lib/tabs';
import {
  CashRow,
  OtherTraderLine,
  TradeBalance,
  TradeListingRow,
  TradeSide,
  VerificationNeeded,
} from './TradeTerms';

/*
 * Putting terms on the table: a new proposal from a Match, and a counter,
 * which is the same picker with the current terms filled in.
 *
 * Each side lists its Trader's active Listings to tick, and cash can come
 * from one side or neither: a single choice of whose, then the amount, so
 * cash both ways cannot be said at all. The totals and the balance at
 * Market Price move as the Trader picks, as the chosen mockup draws them.
 *
 * Sending needs a Verified Trader. An unverified one sees that where the
 * send button would be, rather than a refusal after tapping it.
 */

const proposeRoute = getRouteApi('/trades/new');
const counterRoute = getRouteApi('/trades/$tradeId/counter');

export function ProposeTradeScreen() {
  const { trader, traderId, other, listings, listingId } =
    proposeRoute.useLoaderData();
  const router = useRouter();
  const tabs = useTabs('trades');

  if (!other) {
    return (
      <AppShell
        header={
          <TopBar
            title="Propose a trade"
            onBack={() => router.history.back()}
          />
        }
        {...tabs}
      >
        <EmptyState
          title="No one to propose to"
          hint="Open one of your matches, and propose a trade from the listing it is about."
        />
      </AppShell>
    );
  }

  return (
    <TermsPicker
      title="Propose a trade"
      verified={trader.verified_at !== null}
      traderId={traderId}
      other={other}
      listings={listings}
      initial={{
        listingIds: listingId ? [listingId] : [],
        offeredCashCents: null,
        requestedCashCents: null,
      }}
      submitLabel="Send proposal"
      send={(terms) => proposeTrade(other.id, terms)}
    />
  );
}

export function CounterTradeScreen() {
  const { trader, traderId, trade, listings } = counterRoute.useLoaderData();
  const router = useRouter();
  const tabs = useTabs('trades');

  if (!trade || !isTradersTurn(trade, traderId)) {
    return (
      <AppShell
        header={<TopBar title="Counter" onBack={() => router.history.back()} />}
        {...tabs}
      >
        <EmptyState
          title="This trade is not waiting on your answer"
          hint="It may have been answered already. Your trades list shows where each one stands."
        />
      </AppShell>
    );
  }

  const cash = cashOf(trade, traderId);
  return (
    <TermsPicker
      title="Counter"
      verified={trader.verified_at !== null}
      traderId={traderId}
      other={otherTraderOf(trade, traderId)}
      listings={listings}
      initial={{
        listingIds: trade.listings.map(({ id }) => id),
        offeredCashCents: cash.give,
        requestedCashCents: cash.get,
      }}
      submitLabel="Send counter"
      send={async (terms) => {
        await counterTrade(trade.id, terms);
        return trade.id;
      }}
    />
  );
}

/** Whose cash is on the table, from the picking Trader's side. */
type CashFrom = 'none' | 'you' | 'them';

type TermsPickerProps = {
  title: string;
  verified: boolean;
  traderId: string;
  other: {
    id: string;
    display_name: string | null;
    verified_at: string | null;
    completed_trade_count: number;
  };
  listings: TradeListing[];
  initial: TradeTerms;
  submitLabel: string;
  /** Sends the terms, and returns the id of the Trade they are on. */
  send: (terms: TradeTerms) => Promise<string>;
};

function TermsPicker({
  title,
  verified,
  traderId,
  other,
  listings,
  initial,
  submitLabel,
  send,
}: TermsPickerProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tabs = useTabs('trades');
  const name = other.display_name ?? 'the other trader';

  // A Listing in the initial terms that is no longer active is not in
  // `listings`, so it is dropped here rather than sent to be refused.
  const [picked, setPicked] = useState(
    () =>
      new Set(
        initial.listingIds.filter((id) =>
          listings.some((listing) => listing.id === id),
        ),
      ),
  );
  const [cashFrom, setCashFrom] = useState<CashFrom>(
    initial.offeredCashCents
      ? 'you'
      : initial.requestedCashCents
        ? 'them'
        : 'none',
  );
  const [cashTyped, setCashTyped] = useState(() => {
    const cents = initial.offeredCashCents ?? initial.requestedCashCents;
    return cents ? (cents / 100).toFixed(2) : '';
  });

  const yours = listings.filter((listing) => listing.trader_id === traderId);
  const theirs = listings.filter((listing) => listing.trader_id !== traderId);
  const pickedYours = yours.filter(({ id }) => picked.has(id));
  const pickedTheirs = theirs.filter(({ id }) => picked.has(id));

  const cashCents = cashFrom === 'none' ? null : centsFrom(cashTyped);
  const cashInvalid = cashFrom !== 'none' && cashCents === null;
  const giveCash = cashFrom === 'you' ? cashCents : null;
  const getCash = cashFrom === 'them' ? cashCents : null;
  // The database's rule, said before sending rather than after: a proposal
  // is a trade, so each side gives a Listing or cash.
  const eachSideGives =
    (pickedYours.length > 0 || giveCash !== null) &&
    (pickedTheirs.length > 0 || getCash !== null);

  const submit = useMutation({
    mutationFn: () =>
      send({
        listingIds: [...picked],
        offeredCashCents: giveCash,
        requestedCashCents: getCash,
      }),
    onSuccess: async (tradeId) => {
      // Loaders read through ensureQueryData, which hands back whatever the
      // cache holds, so the Trades are dropped rather than marked stale.
      queryClient.removeQueries({ queryKey: TRADES_KEY });
      await router.invalidate();
      // Replacing the picker, so going back from the Trade does not reopen
      // terms that are already sent.
      void navigate({
        to: '/trades/$tradeId',
        params: { tradeId },
        replace: true,
      });
    },
  });

  function toggle(listingId: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(listingId)) next.add(listingId);
      return next;
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit.mutate();
  }

  const pickRow = (listing: TradeListing) => (
    <li key={listing.id}>
      <label className="block cursor-pointer">
        <TradeListingRow
          listing={listing}
          leading={
            <CheckboxBox
              checked={picked.has(listing.id)}
              onChange={() => toggle(listing.id)}
            />
          }
        />
      </label>
    </li>
  );

  return (
    <AppShell
      header={
        <TopBar
          title={title}
          subtitle={<OtherTraderLine prefix="to" trader={other} />}
          onBack={() => router.history.back()}
        />
      }
      {...tabs}
    >
      <form onSubmit={onSubmit} className="pb-6">
        <TradeSide title="You give" listings={pickedYours} cashCents={giveCash}>
          {yours.map(pickRow)}
          {giveCash !== null ? <CashRow from="you" cents={giveCash} /> : null}
          {yours.length === 0 ? (
            <li className="border-b border-line px-4 py-3 text-sm leading-prose text-muted">
              You have no active listings. You can bring cash instead.
            </li>
          ) : null}
        </TradeSide>

        <TradeSide title="You get" listings={pickedTheirs} cashCents={getCash}>
          {theirs.map(pickRow)}
          {getCash !== null ? <CashRow from={name} cents={getCash} /> : null}
          {theirs.length === 0 ? (
            <li className="border-b border-line px-4 py-3 text-sm leading-prose text-muted">
              {name} has no active listings. They can bring cash instead.
            </li>
          ) : null}
        </TradeSide>

        <div className="flex flex-col gap-3 px-4 pt-4">
          <ChipGroup
            label="Cash"
            showLabel
            options={[
              { value: 'none', label: 'No cash' },
              { value: 'you', label: 'From you' },
              { value: 'them', label: `From ${name}` },
            ]}
            value={cashFrom}
            onChange={setCashFrom}
          />
          {cashFrom !== 'none' ? (
            <div className="flex flex-col gap-1.5">
              <TextInput
                label="Cash amount"
                inputMode="decimal"
                placeholder="In dollars, like 25 or 25.50"
                value={cashTyped}
                onChange={(event) => setCashTyped(event.target.value)}
                hint="Cash is handed over in person at the meetup, never in the app."
              />
              {cashTyped.trim() !== '' && cashInvalid ? (
                <p role="alert" className="text-sm font-semibold text-ink">
                  That is not an amount we can read. Write it in dollars, like
                  25 or 25.50.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <TradeBalance
          give={{ listings: pickedYours, cashCents: giveCash }}
          get={{ listings: pickedTheirs, cashCents: getCash }}
        />

        <div className="flex flex-col gap-2 px-4 pt-4">
          <FormError error={submit.error} />
          {verified ? (
            <>
              <div className="flex">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!eachSideGives || cashInvalid || submit.isPending}
                >
                  {submit.isPending ? 'Sending…' : submitLabel}
                </Button>
              </div>
              <p className="text-center text-sm leading-prose text-muted">
                {eachSideGives
                  ? `${name} can accept, decline, or counter.`
                  : 'Each side needs to give a card or cash.'}
              </p>
            </>
          ) : (
            <VerificationNeeded toDo="send a trade proposal" />
          )}
        </div>
      </form>
    </AppShell>
  );
}

/**
 * What the Trader typed as a cash amount, in cents, or null where it is not
 * one. Cash on a Trade is more than zero or not there at all, so zero is not
 * an amount either.
 */
function centsFrom(typed: string): number | null {
  const dollars = Number(typed.replace(/[$,\s]/g, ''));
  if (!typed.trim() || !Number.isFinite(dollars)) return null;
  const cents = Math.round(dollars * 100);
  return cents > 0 ? cents : null;
}
