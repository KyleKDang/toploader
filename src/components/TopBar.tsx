import type { ReactNode } from 'react';
import { BackIcon } from './icons';

/*
 * The top bar every screen opens with: the screen title at --text-lg, and
 * an optional muted line under it, such as the City a list is scoped to.
 *
 * A screen reached by drilling in gains a back button here, and a screen
 * that leads somewhere gains a control at the other end - the Search tab's
 * way into the Collection is the first (#16). Both sit in a --size-tap box,
 * like everything else tappable.
 */

type TopBarProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** The way back out of a screen that was drilled into. */
  onBack?: () => void;
  /** A control at the right end, such as the way into the Collection. */
  action?: ReactNode;
};

export function TopBar({ title, subtitle, onBack, action }: TopBarProps) {
  return (
    <header className="flex min-h-tap items-center gap-2 border-b border-line bg-bg px-4 py-2">
      {onBack ? (
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          // Pulled into the gutter, so the icon inside the 56px box lines up
          // with the 16px edge the title would have had.
          className="-ml-3.5 flex size-tap shrink-0 items-center justify-center rounded-full text-ink"
        >
          <BackIcon className="text-lg" />
        </button>
      ) : null}

      <div className="min-w-0 grow">
        <h1 className="truncate text-lg font-bold text-ink">{title}</h1>
        {subtitle ? (
          <p className="truncate text-sm text-muted">{subtitle}</p>
        ) : null}
      </div>

      {action}
    </header>
  );
}
