import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useNavigate, useRouter } from '@tanstack/react-router';
import {
  AppShell,
  Badge,
  Button,
  EmptyState,
  FormError,
  Sheet,
  TopBar,
} from '../components';
import {
  acceptTrade,
  declineTrade,
  TRADES_KEY,
  tradeQuery,
  type TradeDetail,
} from '../lib/queries';
import {
  cashOf,
  isTradersTurn,
  otherTraderOf,
  sidesOf,
  STATUS_LABELS,
} from '../lib/trades';
import { useTabs } from '../lib/tabs';
import {
  CashNote,
  CashRow,
  OtherTraderLine,
  TradeBalance,
  TradeListingRow,
  TradeSide,
  VerificationNeeded,
} from './TradeTerms';

/*
 * One Trade, the page every Trade notification links to: the terms from the
 * viewing Trader's side, the state the Trade is in, and whose move it is.
 *
 * While the proposal waits on the viewing Trader, they answer it here:
 * accept, counter, or decline. Accepting and countering both commit them to
 * something, so both need a Verified Trader, and an unverified one sees
 * that instead of those two. Declining commits nobody and is always there,
 * confirmed in a sheet with the ending action second, since it ends the
 * Trade for good.
 *
 * The screen reads the Trade through its query rather than the loader's
 * copy, so an answer the other Trader gave while it was open shows up the
 * next time it is focused.
 */

const route = getRouteApi('/trades/$tradeId');

export function TradeScreen() {
  const { traderId, trader, tradeId } = route.useLoaderData();
  const router = useRouter();
  const trade = useQuery(tradeQuery(tradeId)).data;
  const tabs = useTabs('trades');

  if (!trade) {
    return (
      <AppShell
        header={<TopBar title="Trade" onBack={() => router.history.back()} />}
        {...tabs}
      >
        <EmptyState
          title="That trade is not available"
          hint="Only the two traders on a trade can open it."
        />
      </AppShell>
    );
  }

  const other = otherTraderOf(trade, traderId);
  return (
    <AppShell
      header={
        <TopBar
          title="Trade"
          subtitle={<OtherTraderLine prefix="with" trader={other} />}
          onBack={() => router.history.back()}
        />
      }
      {...tabs}
    >
      <Trade
        trade={trade}
        traderId={traderId}
        verified={trader.verified_at !== null}
      />
    </AppShell>
  );
}

function Trade({
  trade,
  traderId,
  verified,
}: {
  trade: TradeDetail;
  traderId: string;
  verified: boolean;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmingDecline, setConfirmingDecline] = useState(false);

  const other = otherTraderOf(trade, traderId);
  const name = other.display_name ?? 'the other trader';
  const sides = sidesOf(trade.listings, traderId);
  const cash = cashOf(trade, traderId);
  const answering = isTradersTurn(trade, traderId);

  async function refresh() {
    // An answer moves the Trade and, on accept, every Listing on it, so
    // both are dropped from the cache rather than marked stale: a loader
    // reads through ensureQueryData, which hands back whatever is cached.
    queryClient.removeQueries({ queryKey: TRADES_KEY });
    queryClient.removeQueries({ queryKey: ['listing'] });
    queryClient.removeQueries({ queryKey: ['listings'] });
    await router.invalidate();
  }

  const accept = useMutation({
    mutationFn: () => acceptTrade(trade.id),
    onSuccess: refresh,
  });
  const decline = useMutation({
    mutationFn: () => declineTrade(trade.id),
    onSuccess: async () => {
      setConfirmingDecline(false);
      await refresh();
    },
  });

  const openListing = (listingId: string) => () =>
    void navigate({ to: '/listings/$listingId', params: { listingId } });

  return (
    <div className="pb-6">
      <div className="flex flex-col gap-1.5 px-4 pt-4">
        <div className="flex">
          <Badge>{STATUS_LABELS[trade.status]}</Badge>
        </div>
        <p className="text-base text-ink">{statusSentence(trade, traderId)}</p>
      </div>

      <TradeSide title="You give" listings={sides.give} cashCents={cash.give}>
        {sides.give.map((listing) => (
          <li key={listing.id}>
            <TradeListingRow
              listing={listing}
              onClick={openListing(listing.id)}
            />
          </li>
        ))}
        {cash.give !== null ? <CashRow from="you" cents={cash.give} /> : null}
      </TradeSide>

      <TradeSide title="You get" listings={sides.get} cashCents={cash.get}>
        {sides.get.map((listing) => (
          <li key={listing.id}>
            <TradeListingRow
              listing={listing}
              onClick={openListing(listing.id)}
            />
          </li>
        ))}
        {cash.get !== null ? <CashRow from={name} cents={cash.get} /> : null}
      </TradeSide>

      <TradeBalance
        give={{ listings: sides.give, cashCents: cash.give }}
        get={{ listings: sides.get, cashCents: cash.get }}
      />
      {cash.give !== null || cash.get !== null ? <CashNote /> : null}

      {answering ? (
        <div className="flex flex-col gap-2 px-4 pt-4">
          <FormError error={accept.error} />
          {verified ? (
            <>
              <div className="flex">
                <Button
                  variant="primary"
                  disabled={accept.isPending}
                  onClick={() => accept.mutate()}
                >
                  {accept.isPending ? 'Accepting…' : 'Accept'}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    void navigate({
                      to: '/trades/$tradeId/counter',
                      params: { tradeId: trade.id },
                    })
                  }
                >
                  Counter
                </Button>
                <Button onClick={() => setConfirmingDecline(true)}>
                  Decline
                </Button>
              </div>
            </>
          ) : (
            <>
              <VerificationNeeded toDo="accept or counter a trade" />
              <div className="flex">
                <Button onClick={() => setConfirmingDecline(true)}>
                  Decline
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}

      <Sheet
        open={confirmingDecline}
        title="Decline this trade?"
        onClose={() => setConfirmingDecline(false)}
        actions={
          <>
            <Button onClick={() => setConfirmingDecline(false)}>Keep it</Button>
            <Button
              variant="primary"
              disabled={decline.isPending}
              onClick={() => decline.mutate()}
            >
              {decline.isPending ? 'Declining…' : 'Decline'}
            </Button>
          </>
        }
      >
        <p className="text-base leading-prose text-ink">
          This ends the trade, and it cannot be reopened. To ask for different
          terms instead, counter it.
        </p>
        <FormError error={decline.error} />
      </Sheet>
    </div>
  );
}

/** The sentence under the badge: whose move it is, or what comes next. */
function statusSentence(trade: TradeDetail, traderId: string): string {
  switch (trade.status) {
    case 'proposed':
      return isTradersTurn(trade, traderId)
        ? 'Waiting on your answer.'
        : `Waiting on ${otherTraderOf(trade, traderId).display_name ?? 'the other trader'} to answer.`;
    case 'accepted':
      return 'Next, you agree a time and a safe spot to meet at.';
    case 'declined':
      return 'This trade is over.';
    default:
      return `This trade is ${STATUS_LABELS[trade.status].toLowerCase()}.`;
  }
}
