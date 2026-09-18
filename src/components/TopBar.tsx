import type { ReactNode } from 'react';

/*
 * The top bar every screen opens with: the screen title at --text-lg, and
 * an optional muted line under it, such as the City a list is scoped to.
 *
 * A screen reached by drilling in gains a back button here; none exists yet,
 * so the slot lands with the first screen that needs it.
 */

type TopBarProps = {
  title: ReactNode;
  subtitle?: ReactNode;
};

export function TopBar({ title, subtitle }: TopBarProps) {
  return (
    <header className="flex min-h-tap items-center border-b border-line bg-bg px-4 py-2">
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-ink">{title}</h1>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </div>
    </header>
  );
}
