import { useId } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { cx } from '../lib/cx';
import { ChevronDownIcon } from './icons';

/*
 * Select.
 *
 * Drawn as the text input is - --size-btn tall, --radius, --color-surface
 * fill, 2px border, the accent border and glow when focused - so a form that
 * mixes the two reads as one set of fields. The native element stays
 * underneath, which gives each platform its own picker: a wheel on iOS, a
 * sheet on Android.
 *
 * The focus ring is drawn on focus rather than only on :focus-visible, as the
 * text input does, because tapping a field is when it matters which field is
 * active.
 */

type SelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'className' | 'id'
> & {
  /** Always visible above the field. */
  label: string;
  children: ReactNode;
  className?: string;
};

export function Select({ label, children, className, ...props }: SelectProps) {
  const id = useId();

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>

      <div className="relative flex">
        <select
          id={id}
          className={cx(
            'min-h-btn w-full cursor-pointer appearance-none rounded-md border-2 border-line bg-surface pr-11 pl-3.5',
            'text-base text-ink',
            'focus:border-accent focus:shadow-focus',
            'focus:outline-2 focus:outline-offset-2 focus:outline-accent',
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute inset-y-0 right-3.5 my-auto text-lg text-muted" />
      </div>
    </div>
  );
}
