import { AppShell, EmptyState, TopBar } from '../components';
import { useTabs } from '../lib/tabs';
import { CardSearchField } from './CardSearchField';

/*
 * The Search tab: the Catalog search, and room under it for what the Trader
 * will find. The field takes focus on arrival, since typing is the only
 * thing to do here.
 */
export function SearchScreen() {
  return (
    <AppShell header={<TopBar title="Search" />} {...useTabs('search')}>
      <CardSearchField autoFocus />
      <EmptyState
        title="Find any card"
        hint="Type a card's name or its collector number, then open it to see its market price."
      />
    </AppShell>
  );
}
