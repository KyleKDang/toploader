import { useId } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { cx } from '../lib/cx';

/*
 * Multi-line text input, for what a Trader writes in sentences rather than
 * a word or two: the reason for a report.
 *
 * Drawn as the text input is - --radius, --color-surface fill, 2px border,
 * the accent border, glow, and outline on focus - and four lines tall, so
 * a few sentences show whole while they are written. It grows no further on
 * its own; past four lines it scrolls inside itself, which keeps a sheet's
 * buttons on screen above the keyboard.
 *
 * Labelled and hinted the way the text input is: a visible label always,
 * guidance in a hint under the field, never in a placeholder alone.
 */

type TextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'className' | 'id' | 'aria-describedby' | 'rows'
> & {
  label: string;
  /** Optional guidance under the field, visible while typing. */
  hint?: string;
  className?: string;
};

export function TextArea({ label, hint, className, ...props }: TextAreaProps) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>

      <textarea
        id={id}
        rows={4}
        aria-describedby={hint ? hintId : undefined}
        className={cx(
          'resize-none rounded-md border-2 border-line bg-surface px-3.5 py-2.5 text-base leading-prose text-ink placeholder:text-muted',
          'focus:border-accent focus:shadow-focus',
          'focus:outline-2 focus:outline-offset-2 focus:outline-accent',
        )}
        {...props}
      />

      {hint ? (
        <p id={hintId} className="text-sm leading-prose text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
