import { useNavigate } from '@tanstack/react-router';
import type { TabKey } from '../components';

/*
 * Where each tab of the bottom bar goes. A tab with no screen yet has no
 * path here, and every screen's bar shows it disabled, so the list of built
 * tabs lives in one place rather than once per screen.
 */

const TAB_PATHS: Partial<Record<TabKey, '/' | '/search'>> = {
  matches: '/',
  search: '/search',
};

const ALL_TABS: readonly TabKey[] = ['matches', 'search', 'trades', 'profile'];

/**
 * The bar's props for a screen in the `active` tab. The active tab is never
 * disabled, even before its own top-level screen exists, since a screen
 * inside it is showing.
 */
export function useTabs(active: TabKey) {
  const navigate = useNavigate();

  return {
    tab: active,
    onSelectTab: (tab: TabKey) => {
      const to = TAB_PATHS[tab];
      if (to) void navigate({ to });
    },
    unavailableTabs: ALL_TABS.filter(
      (tab) => tab !== active && !TAB_PATHS[tab],
    ),
  };
}
