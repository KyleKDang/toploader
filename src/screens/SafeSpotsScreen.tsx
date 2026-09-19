import { getRouteApi } from '@tanstack/react-router';
import { AppShell, Badge, EmptyState, ListRow, TopBar } from '../components';
import type { Database } from '../lib/database.types';
import { useTabs } from '../lib/tabs';

/*
 * The Safe Spot directory: the curated public places in the Trader's City
 * where a Meetup can happen. Read-only; the Safe Spots are seeded by
 * migration.
 *
 * It sits in the Trades section, since a Safe Spot is where a Trade meets.
 * Nothing links here yet: the Trades screen and the Meetup picker (#23) are
 * the ways in once they exist.
 */

const route = getRouteApi('/safe-spots');

const KIND_LABELS: Record<
  Database['public']['Enums']['safe_spot_kind'],
  string
> = {
  police_station: 'Police station',
  monitored_site: 'Monitored site',
};

export function SafeSpotsScreen() {
  const { trader, safeSpots } = route.useLoaderData();
  const cityName = trader.city.name;

  return (
    <AppShell
      header={<TopBar title="Safe Spots" subtitle={cityName} />}
      {...useTabs('trades')}
    >
      {safeSpots.length === 0 ? (
        <EmptyState
          className="min-h-full"
          title={`No Safe Spots in ${cityName} yet`}
          hint="The Toploader team adds the public places to meet in each area."
        />
      ) : (
        <ul aria-label="Safe Spots">
          {safeSpots.map((spot) => (
            <li key={spot.id}>
              <ListRow
                title={spot.name}
                detail={spot.address}
                relation={spot.notes}
                relationTrailing={<Badge>{KIND_LABELS[spot.kind]}</Badge>}
                wrapRelation
              />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
