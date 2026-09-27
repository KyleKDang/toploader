import { useQuery } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import {
  AppShell,
  CardTile,
  EmptyState,
  ListRow,
  ReputationPill,
  TopBar,
} from '../components';
import { tradesQuery, type TradeSummary } from '../lib/queries';
import { cashOf, otherTraderOf, whoseMove } from '../lib/trades';
import { useTabs } from '../lib/tabs';

/*
 * Trades, the tab: every Trade the Trader is party to, newest first, so one
 * can be found without the notification that announced it. Each row names
 * the other Trader, the Cards on the table, and whose move it is.
 *
 * The list is read through its query, which refetches on each visit: the
 * other Trader can answer a proposal at any time.
 */

const route = getRouteApi('/trades');

export function TradesScreen() {
  const { traderId } = route.useLoaderData();
  const navigate = useNavigate();
  const trades = useQuery(tradesQuery(traderId));

  return (
    <AppShell header={<TopBar title="Trades" />} {...useTabs('trades')}>
      {trades.data?.length ? (
        <ul aria-label="Your trades">
          {trades.data.map((trade) => (
            <li key={trade.id}>
              <TradeRow trade={trade} traderId={traderId} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="min-h-full"
          title="No trades yet"
          hint="Open one of your matches and propose a trade from it. Trades you send or get show up here."
          action={{
            label: 'See your matches',
            onClick: () => void navigate({ to: '/' }),
          }}
        />
      )}
    </AppShell>
  );
}

/*
 * One Trade, read from the Trader's side. The thumbnail takes empty alt
 * text: it is the first Card on the table, and the row names every Card.
 */
function TradeRow({
  trade,
  traderId,
}: {
  trade: TradeSummary;
  traderId: string;
}) {
  const navigate = useNavigate();
  const other = otherTraderOf(trade, traderId);
  const cash = cashOf(trade, traderId);
  const cards = trade.listings.map(
    (listing) => listing.card_variants.cards.name,
  );
  if (cash.give !== null || cash.get !== null) cards.push('cash');

  return (
    <ListRow
      leading={<CardTile src={trade.thumbnailUrl} alt="" />}
      title={`Trade with ${other.display_name ?? 'a trader'}`}
      detail={cards.join(', ')}
      relation={whoseMove(trade, traderId)}
      relationTrailing={
        <ReputationPill
          verified={other.verified_at !== null}
          trades={other.completed_trade_count}
        />
      }
      onClick={() =>
        void navigate({
          to: '/trades/$tradeId',
          params: { tradeId: trade.id },
        })
      }
    />
  );
}
