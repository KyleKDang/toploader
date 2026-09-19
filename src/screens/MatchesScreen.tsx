import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { AppShell, EmptyState, TopBar } from '../components';
import { useTabs } from '../lib/tabs';

/*
 * Matches, the landing view. Matching lands with #19, so for now this is
 * only the empty state - the first one in the app, and the pattern every
 * later empty state copies.
 *
 * Wants (#18) and Listings (#17) both start from the Catalog search, so
 * Search is the one way in the empty state offers.
 */

const route = getRouteApi('/');

export function MatchesScreen() {
  const { trader } = route.useLoaderData();
  const navigate = useNavigate();
  const cityName = trader.city.name;

  return (
    <AppShell
      header={<TopBar title="Matches" subtitle={cityName} />}
      {...useTabs('matches')}
    >
      <EmptyState
        className="min-h-full"
        title={`No matches in ${cityName} yet`}
        hint="Add wants and listings from Search, and the matches for them show up here."
        action={{
          label: 'Search for a card',
          onClick: () => void navigate({ to: '/search' }),
        }}
      />
    </AppShell>
  );
}
