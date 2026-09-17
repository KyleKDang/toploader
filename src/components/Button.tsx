import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

/*
 * Button.
 *
 * --size-btn tall, --radius, 17px semibold, label in words with an optional
 * leading icon. There is no ghost or text-only variant: everything tappable
 * has a visible edge, so the secondary variant carries a 2px border rather
 * than dropping to bare text.
 *
 * Buttons in a row are equal width and a stack is full width, which is what
 * `flex-1` below does - the parent decides the direction, the button just
 * fills its share of it.
 *
 * OPEN: the design system asks for two things that do not quite fit. A button
 * is --size-btn tall, 52px, which is what the control-size table and the
 * chosen mockups both say. Its touch-target rule then says nothing tappable
 * is smaller than --size-tap, 56px, in either dimension. The table wins here
 * because it is the more specific statement and it is what the approved
 * mockups show, and 52px still clears the 44px platform minimum - but the
 * contradiction belongs in docs/design-system.md rather than in a comment,
 * and it should be settled there before #13 places real buttons. Raised on
 * #40.
 */

type ButtonProps = {
  /** Primary is the accent fill. One primary per screen area. */
  variant?: 'primary' | 'secondary';
  /** Optional leading icon. The label still carries the meaning. */
  icon?: ReactNode;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

export function Button({
  variant = 'secondary',
  icon,
  children,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'flex min-h-btn flex-1 items-center justify-center gap-2 rounded-md border-2 px-4',
        'text-base font-semibold',
        variant === 'primary'
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-line bg-surface text-ink',
        'disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
