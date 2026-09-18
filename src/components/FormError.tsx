/*
 * A form's failure, announced as it appears.
 *
 * Ink, not a color: the design system has no error palette, and
 * --color-alert is for unread markers only. The words carry it.
 */

type FormErrorProps = {
  error: Error | null;
};

export function FormError({ error }: FormErrorProps) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm font-semibold text-ink">
      {error.message}
    </p>
  );
}
