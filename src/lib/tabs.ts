import { useNavigate } from '@tanstack/react-router';
import type { TabKey } from '../components';

/*
 * Where each tab of the bottom bar goes. A tab with no screen yet goes
 * nowhere, and every screen's bar shows it disabled, so the list of built
 * tabs lives in one place rather than once per screen. Every tab is named
 * here, so a new tab on the bar does not compile until it is given a place.
 */

const TAB_PATHS: Record<TabKey, '/' | '/search' | null> = {
  matches: '/',
  search: '/search',
  trades: null,
  profile: null,
};

const TABS = Object.keys(TAB_PATHS) as TabKey[];

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
    unavailableTabs: TABS.filter(
      (tab) => tab !== active && TAB_PATHS[tab] === null,
    ),
  };
}
