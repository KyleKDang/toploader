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
import { formatPrice } from '../lib/format';
import { matchesQuery, type Match } from '../lib/queries';
import { useTabs } from '../lib/tabs';

/*
 * Matches, the landing view: every pair in the Trader's City where one side's
 * Listing satisfies the other side's Want, from both directions - other
 * Traders' Listings the Trader wants, and the Trader's own Listings that
 * someone else wants.
 *
 * Both Traders' Reputation is on screen: the other Trader's on each row, the
 * Trader's own in the header, which is where the chosen mockup puts it,
 * since it is the same on every row.
 *
 * The price on a row is the Variant's Market Price, as in the mockup: it is
 * the one reference both sides of a pairing share, whereas an asking price
 * exists on only some Listings and means nothing on a Want. The Listing's
 * own page, one tap away, carries the asking price.
 */

const route = getRouteApi('/');

export function MatchesScreen() {
  const { trader, traderId } = route.useLoaderData();
  const navigate = useNavigate();
  const matches = useQuery(matchesQuery(traderId));
  const cityName = trader.city.name;

  return (
    <AppShell
      header={
        <TopBar
          title="Matches"
          subtitle={
            <>
              {cityName} · You{' '}
              <ReputationPill
                verified={trader.verified_at !== null}
                trades={trader.completed_trade_count}
                className="align-middle"
              />
            </>
          }
        />
      }
      {...useTabs('matches')}
    >
      {matches.data?.length ? (
        <>
          <ul aria-label="Your matches">
            {matches.data.map((match) => (
              <li key={`${match.listing.id}:${match.wanter.id}`}>
                <MatchRow match={match} traderId={traderId} />
              </li>
            ))}
          </ul>
          <p className="px-4 py-3 text-xs leading-prose text-muted">
            Prices are market prices, updated daily.
          </p>
        </>
      ) : (
        <EmptyState
          className="min-h-full"
          title={`No matches in ${cityName} yet`}
          hint="Add wants and listings from Search, and the matches for them show up here."
          action={{
            label: 'Search for a card',
            onClick: () => void navigate({ to: '/search' }),
          }}
        />
      )}
    </AppShell>
  );
}

/*
 * One pairing, read from the Trader's side: the Card, and who the other
 * Trader is to them. The thumbnail takes empty alt text for the reason City
 * browse gives: the row beside it already names the Card and its Condition.
 */
function MatchRow({ match, traderId }: { match: Match; traderId: string }) {
  const navigate = useNavigate();
  const { listing, lister, wanter } = match;
  const variant = listing.card_variants;
  const card = variant.cards;
  const theirs = lister.id !== traderId;
  const other = theirs ? lister : wanter;
  const name = other.display_name ?? 'A trader';

  return (
    <ListRow
      leading={<CardTile src={match.thumbnailUrl} alt="" />}
      title={card.name}
      trailing={
        variant.market_price_cents === null ? null : (
          <span className="tabular-nums">
            {formatPrice(variant.market_price_cents)}
          </span>
        )
      }
      detail={`${variant.name} · ${listing.condition} · ${card.card_sets.name} ${card.number}`}
      // Which way the pairing runs comes first and the name after it. The
      // Reputation pill takes about half of this line at 375px, and the row
      // truncates rather than wraps, so whatever is at the end is what gets
      // cut; a long name losing its tail is fine, the direction is not.
      relation={theirs ? `Listed by ${name}` : `Wanted by ${name}`}
      relationTrailing={
        <ReputationPill
          verified={other.verified_at !== null}
          trades={other.completed_trade_count}
        />
      }
      onClick={() =>
        void navigate({
          to: '/listings/$listingId',
          params: { listingId: listing.id },
        })
      }
    />
  );
}
