import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

/*
 * Stat strip: the panel a screen's one big number sits in - the Market Price
 * on the Card page, the total value of a Collection.
 *
 * --color-surface fill, a --color-line border and --radius, with an eyebrow
 * over the number saying what it is and how fresh it is. Every number the
 * app shows this way is a daily reference rather than a live one, and the
 * eyebrow is where it says so (ADR-0003).
 *
 * The strip owns the panel and the eyebrow; what goes under it is the
 * screen's, since a Market Price and a Collection's value are read off
 * differently underneath.
 */

type StatStripProps = {
  /** Names the strip for assistive tech, e.g. "Market Price". */
  name: string;
  /** The eyebrow: what the number is, and how fresh. */
  label: ReactNode;
  children: ReactNode;
  className?: string;
};

export function StatStrip({
  name,
  label,
  children,
  className,
}: StatStripProps) {
  return (
    <section
      aria-label={name}
      className={cx(
        'mx-4 flex flex-col gap-0.5 rounded-md border border-line bg-surface px-3.5 py-3',
        className,
      )}
    >
      <p className="text-xs font-semibold text-muted">{label}</p>
      {children}
    </section>
  );
}
