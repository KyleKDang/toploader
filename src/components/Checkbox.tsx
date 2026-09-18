import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';
import { CheckIcon } from './icons';

/*
 * Checkbox.
 *
 * The box is drawn small - --radius-sm, as the design system sizes it - but
 * the target is not: per the touch-target rule the visual sits inside a
 * --size-tap box rather than the box shrinking to the visual. Here that box
 * is the whole label row, so the words are tappable too.
 *
 * The native input is the box itself, restyled, so it keeps its keyboard
 * behavior, its `required` validation, and the global focus ring.
 */

type CheckboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'className' | 'id' | 'children'
> & {
  /** What ticking the box says. Always visible, always in words. */
  label: ReactNode;
  className?: string;
};

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  const id = useId();

  return (
    <label
      htmlFor={id}
      className={cx(
        'flex min-h-tap cursor-pointer items-center gap-3',
        className,
      )}
    >
      <span className="relative flex shrink-0">
        <input
          id={id}
          type="checkbox"
          className={cx(
            'peer size-6 cursor-pointer appearance-none rounded-sm border-2 border-line bg-surface',
            'checked:border-accent checked:bg-accent',
          )}
          {...props}
        />
        <CheckIcon className="pointer-events-none absolute inset-0 m-auto hidden text-base text-accent-ink peer-checked:block" />
      </span>
      <span className="text-base text-ink">{label}</span>
    </label>
  );
}
