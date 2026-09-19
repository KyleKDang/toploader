import { useId } from 'react';
import { cx } from '../lib/cx';

/*
 * Chip group: one choice from a few, drawn as chips - the Variant on the
 * Card page, and later a Condition.
 *
 * Each chip is --size-chip tall, --radius-full, --text-sm semibold:
 * --color-surface with a 2px --color-line border at rest, and the accent
 * fill with --color-accent-ink text when chosen. A chip is meant to read
 * small, so it gets its 56px touch target by sitting inside a --size-tap box
 * rather than growing; the boxes sit 8px apart. Chips wrap onto another line
 * rather than scrolling sideways, so every choice stays in view.
 *
 * Underneath, the chips are native radio buttons, so arrow keys move the
 * choice and a screen reader hears a radio group with its label.
 */

type ChipGroupProps<T extends string | number> = {
  /** Names the group for assistive tech, e.g. "Variant". */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export function ChipGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  className,
}: ChipGroupProps<T>) {
  const name = useId();

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx('flex flex-wrap gap-2', className)}
    >
      {options.map((option) => (
        <label
          key={option.value}
          className="flex min-h-tap min-w-tap cursor-pointer items-center justify-center"
        >
          <input
            type="radio"
            name={name}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
            className="peer sr-only"
          />
          <span
            className={cx(
              'flex h-chip items-center rounded-full border-2 px-3 text-sm font-semibold',
              'border-line bg-surface text-ink',
              'peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-ink',
              'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
            )}
          >
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}
