import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

/*
 * List row. The workhorse.
 *
 * --size-row minimum height, 16px side padding, a --color-line divider under
 * it, --color-surface-2 on hover and press.
 *
 * Left: a thumbnail or an avatar. Right: up to three lines - line 1 is the
 * name with a price pushed to the right edge, line 2 is --text-sm muted
 * detail, line 3 carries relationship text and a Reputation pill.
 *
 * Rows never wrap; they truncate with an ellipsis. That is the Large Print
 * bargain: about five Matches on a screen rather than ten, and a long Card
 * name gets cut short rather than pushing the row taller.
 */

type ListRowProps = {
  /** Thumbnail or avatar. */
  leading?: ReactNode;
  /** Line 1, left. The Card name, the Trader name. */
  title: ReactNode;
  /** Line 1, right. A price, a count, a short status. */
  trailing?: ReactNode;
  /** Line 2. Set, collector number, Variant, Condition. */
  detail?: ReactNode;
  /** Line 3, left. Relationship text: who lists it, who wants it. */
  relation?: ReactNode;
  /** Line 3, right. Usually a ReputationPill. */
  relationTrailing?: ReactNode;
  /** An unread row carries a 7px accent dot before its title. */
  unread?: boolean;
  /** Renders as a button when given; rows are otherwise plain content. */
  onClick?: () => void;
  className?: string;
};

export function ListRow({
  leading,
  title,
  trailing,
  detail,
  relation,
  relationTrailing,
  unread = false,
  onClick,
  className,
}: ListRowProps) {
  const Element = onClick ? 'button' : 'div';

  return (
    <Element
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cx(
        'flex w-full min-h-row items-center gap-3.5 border-b border-line px-4 py-2.5 text-left',
        onClick && 'hover:bg-surface-2 active:bg-surface-2',
        className,
      )}
    >
      {leading}

      {/*
        Every level of this stack carries min-w-0. A flex or grid child
        defaults to min-width:auto, which refuses to shrink below its content
        and pushes a long Card name and its price straight off the row - the
        one thing a row that never wraps cannot afford.
      */}
      <span className="flex min-w-0 grow flex-col gap-0.75">
        <span className="flex min-w-0 items-baseline justify-between gap-2.5">
          <span className="min-w-0 truncate font-bold text-ink">
            {unread ? (
              <span
                aria-hidden="true"
                className="mr-1.75 inline-block size-1.75 rounded-full bg-accent align-middle"
              />
            ) : null}
            {title}
          </span>
          {trailing ? (
            <span className="tabular shrink-0 whitespace-nowrap font-bold text-ink">
              {trailing}
            </span>
          ) : null}
        </span>

        {detail ? (
          <span className="min-w-0 truncate text-sm text-muted">{detail}</span>
        ) : null}

        {relation || relationTrailing ? (
          <span className="flex min-w-0 items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-muted">{relation}</span>
            {relationTrailing}
          </span>
        ) : null}
      </span>
    </Element>
  );
}
