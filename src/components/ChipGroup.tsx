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
 *
 * The label is the accessible name, and `showLabel` also draws it above the
 * chips. One group whose meaning its surroundings already give - the Variant
 * on the card page - does not need it; two groups side by side do, or the
 * chips read as one row of nine with two of them chosen.
 */

type ChipGroupProps<T extends string | number> = {
  /** Names the group, e.g. "Variant". */
  label: string;
  /** Draws the label above the chips, as well as naming the group by it. */
  showLabel?: boolean;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export function ChipGroup<T extends string | number>({
  label,
  showLabel = false,
  options,
  value,
  onChange,
  className,
}: ChipGroupProps<T>) {
  const name = useId();
  const labelId = useId();

  return (
    <div className={className}>
      {showLabel ? (
        <p id={labelId} className="mb-1 text-sm font-semibold text-ink">
          {label}
        </p>
      ) : null}
      <div
        role="radiogroup"
        aria-label={showLabel ? undefined : label}
        aria-labelledby={showLabel ? labelId : undefined}
        className="flex flex-wrap gap-2"
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
    </div>
  );
}
