import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

/*
 * Text input.
 *
 * --size-btn tall, --radius, --color-surface fill, 2px border. Focused, the
 * border is --color-accent with a 3px accent glow at 18% opacity - that glow
 * lives on the wrapper via focus-within, so the icon and the field light up
 * together the way the mockups draw them.
 *
 * The 2px accent outline at 2px offset rides the wrapper for the same reason.
 * Focus styles are never removed, so the inner input drops its own outline
 * only because the control it sits inside has taken it over - otherwise the
 * ring would be drawn inside the field's border, against the fill rather
 * than the page.
 *
 * Every input has a visible label, or an aria-label where the placeholder is
 * unambiguous as in the Catalog search. The `label` prop takes the first
 * route and `aria-label` the second; one of them is required by the type.
 */

type Base = Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'>;

type TextInputProps = Base & {
  /** Optional leading icon inside the field, e.g. the Catalog search glass. */
  icon?: ReactNode;
  className?: string;
} & (
    | { label: string; 'aria-label'?: never }
    | { label?: never; 'aria-label': string }
  );

export function TextInput({
  label,
  icon,
  className,
  ...props
}: TextInputProps) {
  const id = useId();

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
      ) : null}

      <div
        className={cx(
          'flex min-h-btn items-center gap-2.5 rounded-md border-2 border-line bg-surface px-3.5',
          'focus-within:border-accent focus-within:shadow-focus',
          'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
        )}
      >
        {icon ? <span className="text-muted">{icon}</span> : null}
        <input
          id={id}
          className="min-w-0 grow self-stretch bg-transparent text-base text-ink outline-none placeholder:text-muted"
          {...props}
        />
      </div>
    </div>
  );
}
