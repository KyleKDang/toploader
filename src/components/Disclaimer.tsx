import { cx } from '../lib/cx';

/*
 * The non-affiliation disclaimer.
 *
 * A locked constraint, not a design choice: branding stays neutral, "for
 * Pokemon TCG collectors" appears only as descriptive text, and this line is
 * visible rather than buried in a Terms page.
 *
 * It sits at --text-xs, which is the app's floor - 13px, and nothing goes
 * below it, legal text included.
 *
 * Placed at the foot of the Trader profile and the About screen. The wording
 * is fixed here rather than passed in, so it cannot drift screen to screen.
 */

const DISCLAIMER =
  'Toploader is an independent app for Pokemon TCG collectors. It is not ' +
  'affiliated with, endorsed by, or sponsored by Nintendo, Creatures, ' +
  'Game Freak, or The Pokemon Company.';

type DisclaimerProps = {
  className?: string;
};

export function Disclaimer({ className }: DisclaimerProps) {
  return (
    <p
      className={cx(
        'border-t border-line px-4 pt-3 text-xs leading-prose text-muted',
        className,
      )}
    >
      {DISCLAIMER}
    </p>
  );
}
