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
 * --size-btn and --size-tap are both 56px, so a button needs nothing extra to
 * clear the touch-target floor. They used to differ by 4px, which no button
 * could satisfy both of; the design system was corrected rather than worked
 * around, in #40.
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
