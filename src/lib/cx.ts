/**
 * Joins class names, dropping anything falsy.
 *
 * Deliberately not a class *merger*: a primitive owns its own classes and a
 * caller's `className` is appended, so a caller that needs a different look
 * changes the primitive rather than overriding it from outside.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
