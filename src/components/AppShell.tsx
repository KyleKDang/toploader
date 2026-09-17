import type { ReactNode } from 'react';
import { BottomTabBar } from './BottomTabBar';
import type { TabKey } from './BottomTabBar';

/*
 * The app shell: a single column, the content scrolling inside it, the tab
 * bar pinned under it.
 *
 * Single column at every width. Above 640px - Tailwind's `sm`, and the
 * design system takes Tailwind's default breakpoints - the column caps at
 * 480px and centers, and that is the whole responsive story for v1.
 *
 * The viewport-height frame with the content scrolling inside it is gate 1's
 * app feel: the bar stays put while a list moves under it, rather than the
 * page scrolling away as a document would.
 */

type AppShellProps = {
  /** The top bar. Each screen brings its own. */
  header?: ReactNode;
  children: ReactNode;
  tab: TabKey;
  onSelectTab?: (tab: TabKey) => void;
  /** Tabs with something new. An alert dot rides the icon. */
  unreadTabs?: readonly TabKey[];
  /** Tabs not yet reachable. Visibly inactive rather than broken. */
  unavailableTabs?: readonly TabKey[];
};

export function AppShell({
  header,
  children,
  tab,
  onSelectTab,
  unreadTabs,
  unavailableTabs,
}: AppShellProps) {
  return (
    <div className="flex h-dvh justify-center bg-bg text-ink">
      <div className="flex h-full w-full flex-col sm:max-w-content sm:border-x sm:border-line">
        {header}

        <main className="grow overflow-y-auto overscroll-contain">
          {children}
        </main>

        <BottomTabBar
          active={tab}
          onSelect={onSelectTab}
          unreadTabs={unreadTabs}
          unavailableTabs={unavailableTabs}
        />
      </div>
    </div>
  );
}
