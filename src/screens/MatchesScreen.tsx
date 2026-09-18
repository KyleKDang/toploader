import { getRouteApi } from '@tanstack/react-router';
import { AppShell, EmptyState, TopBar } from '../components';
import type { TabKey } from '../components';

/*
 * Matches, the landing view. Matching lands with #19, so for now this is
 * only the empty state - the first one in the app, and the pattern every
 * later empty state copies.
 *
 * Wants (#18) and Listings (#17) both start from the Catalog search (#15),
 * so Search is the one way in the empty state offers. It is shown disabled
 * until Search exists, rather than pointing at a screen invented here.
 */

const route = getRouteApi('/');

/** The tabs whose screens are not built yet. */
const UNBUILT_TABS: readonly TabKey[] = ['search', 'trades', 'profile'];

export function MatchesScreen() {
  const { trader } = route.useLoaderData();
  const cityName = trader.city?.name;

  return (
    <AppShell
      header={<TopBar title="Matches" subtitle={cityName} />}
      tab="matches"
      unavailableTabs={UNBUILT_TABS}
    >
      <EmptyState
        className="min-h-full"
        title={`No matches in ${cityName} yet`}
        hint="Add wants and listings from Search, and the matches for them show up here."
        action={{ label: 'Search for a card', disabled: true }}
      />
    </AppShell>
  );
}
