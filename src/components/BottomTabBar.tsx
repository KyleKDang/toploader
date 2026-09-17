import { cx } from '../lib/cx';
import { MatchesIcon, ProfileIcon, SearchIcon, TradesIcon } from './icons';

/*
 * Bottom tab bar.
 *
 * Four tabs: Matches, Search, Trades, Profile. Each is a 26px icon over a
 * 13px label, --size-tap minimum, --color-muted at rest and --color-accent
 * when active, with 22px of bottom padding for the home indicator.
 *
 * An --color-alert dot rides the icon when that tab has something new. The
 * dot is orange-red rather than crimson because it sits directly beside the
 * green accent here, and green/crimson is the one pair a red-green colorblind
 * Trader cannot separate.
 *
 * The bar is present on every top-level screen and hidden on nothing; a
 * screen reached by drilling in keeps it and gains a back button in the top
 * bar.
 */

export type TabKey = 'matches' | 'search' | 'trades' | 'profile';

const TABS = [
  { key: 'matches', label: 'Matches', Icon: MatchesIcon },
  { key: 'search', label: 'Search', Icon: SearchIcon },
  { key: 'trades', label: 'Trades', Icon: TradesIcon },
  { key: 'profile', label: 'Profile', Icon: ProfileIcon },
] as const satisfies ReadonlyArray<{
  key: TabKey;
  label: string;
  Icon: typeof MatchesIcon;
}>;

type BottomTabBarProps = {
  active: TabKey;
  onSelect?: (tab: TabKey) => void;
  /** Tabs with something new. An alert dot rides the icon. */
  unreadTabs?: readonly TabKey[];
  /** Tabs not yet reachable. Visibly inactive rather than broken. */
  unavailableTabs?: readonly TabKey[];
  className?: string;
};

export function BottomTabBar({
  active,
  onSelect,
  unreadTabs = [],
  unavailableTabs = [],
  className,
}: BottomTabBarProps) {
  return (
    <nav
      aria-label="Sections"
      className={cx(
        'grid grid-cols-4 border-t border-line bg-bg px-2 pt-2 pb-5.5',
        className,
      )}
    >
      {TABS.map(({ key, label, Icon }) => {
        const isActive = key === active;
        const isUnavailable = unavailableTabs.includes(key);

        return (
          <button
            key={key}
            type="button"
            disabled={isUnavailable}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect?.(key)}
            className={cx(
              'relative flex min-h-tap flex-col items-center justify-center gap-0.75 rounded-md',
              'text-xs font-semibold',
              isActive ? 'text-accent' : 'text-muted',
              isUnavailable && 'opacity-40',
            )}
          >
            <span className="relative text-tab-icon">
              <Icon />
              {unreadTabs.includes(key) ? (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-1.5 size-3 rounded-full border-2 border-bg bg-alert"
                />
              ) : null}
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}
