import type { ReactNode } from 'react';
import { Button } from './Button';
import { cx } from '../lib/cx';

/*
 * Empty state.
 *
 * Centered in the content area: one line saying what would be here, one muted
 * line saying how to get there, and one primary button that does it. No
 * illustration.
 *
 * The empty Matches view in #13 is the first one and sets the pattern every
 * later empty state copies.
 */

type EmptyStateProps = {
  /** What would be here. One line, --text-base. */
  title: ReactNode;
  /** How to get there. One line, muted. */
  hint: ReactNode;
  /** The one action that gets there. Omitted only where there is none. */
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
};

export function EmptyState({
  title,
  hint,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-2 px-4 py-10 text-center',
        className,
      )}
    >
      <p className="text-base text-ink">{title}</p>
      <p className="max-w-content text-sm leading-prose text-muted">{hint}</p>
      {action ? (
        <div className="mt-2 flex w-full max-w-content">
          <Button variant="primary" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
