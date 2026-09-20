import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { MinusIcon, PlusIcon } from './icons';

/*
 * Stepper: a small whole number a Trader sets by tapping, such as how many
 * Copies of a Card they own.
 *
 * Two --size-btn squares with the number between them. They carry the
 * secondary button's look - --color-surface fill, 2px --color-line border,
 * --radius - rather than the Button primitive itself, because a Button fills
 * its share of a row and these two must stay square at the touch-target
 * size, the way ChipGroup draws its own chips for the same reason.
 *
 * A number is a poor label for a screen reader on its own, so the pair is a
 * group named by `label`, and the value is an `output` that announces itself
 * when it changes. The buttons stop at the ends of the range rather than
 * wrapping: a quantity below the minimum is a removal, which is its own
 * control wherever a stepper appears.
 */

type StepperProps = {
  /** Names the control for assistive tech, e.g. "Quantity". */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
};

export function Stepper({
  label,
  value,
  onChange,
  min = 1,
  max = 99,
  className,
}: StepperProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx('flex items-center gap-2', className)}
    >
      <StepButton
        label="Subtract one"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <MinusIcon className="text-xl" />
      </StepButton>

      <output className="min-w-10 text-center text-lg font-bold tabular-nums text-ink">
        {value}
      </output>

      <StepButton
        label="Add one"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <PlusIcon className="text-xl" />
      </StepButton>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex size-btn shrink-0 items-center justify-center rounded-md',
        'border-2 border-line bg-surface text-ink disabled:opacity-60',
      )}
    >
      {children}
    </button>
  );
}
