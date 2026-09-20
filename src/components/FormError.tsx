import { cx } from '../lib/cx';
import { messageForTrader } from '../lib/errors';

/*
 * A form's failure, announced as it appears, in the app's words rather than
 * the backend's.
 *
 * Ink, not a color: the design system has no error palette, and
 * --color-alert is for unread markers only. The words carry it.
 */

type FormErrorProps = {
  error: Error | null;
  /** Where the message sits, when it is not inside a form's own stack. */
  className?: string;
};

export function FormError({ error, className }: FormErrorProps) {
  if (!error) return null;
  return (
    <p role="alert" className={cx('text-sm font-semibold text-ink', className)}>
      {messageForTrader(error)}
    </p>
  );
}
