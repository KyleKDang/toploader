import { useEffect, useState } from 'react';

/**
 * `value`, once it has held still for `delayMs`. A search waits for a pause
 * in typing rather than asking the database once per keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
