import { useId, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cx } from '../lib/cx';
import { SearchIcon } from './icons';
import { TextInput } from './TextInput';

/*
 * Search picker. The only typeahead pattern in the app: the Catalog search
 * and any later Card picker use it.
 *
 * A text input with a results panel below it: --shadow-popover, --radius,
 * --color-surface fill, and a --color-line border so it still floats in dark
 * mode, where a shadow is nearly invisible. The panel floats over whatever
 * is under the field rather than pushing it down.
 *
 * It is an ARIA combobox: the field owns a listbox of options, the arrow
 * keys move through them, Enter picks the highlighted one (or the first),
 * and Escape closes the panel. Focus never leaves the field, so a Trader
 * keeps typing to refine.
 *
 * What to search and how to draw a result is the caller's; this component
 * owns only the field, the panel, and moving between results.
 */

type SearchPickerProps<T> = {
  /** Names the field. The placeholder repeats it, so there is no label. */
  'aria-label': string;
  /** Names the list of results, e.g. "Cards". */
  resultsLabel: string;
  value: string;
  onChange: (value: string) => void;
  results: readonly T[];
  getKey: (result: T) => string | number;
  /** One result, drawn as a list row. */
  renderResult: (result: T) => ReactNode;
  onSelect: (result: T) => void;
  /**
   * A line for the panel when there are no results to show, such as "No
   * cards match". The panel stays closed while there is neither.
   */
  status?: ReactNode;
  autoFocus?: boolean;
  className?: string;
};

export function SearchPicker<T>({
  'aria-label': ariaLabel,
  resultsLabel,
  value,
  onChange,
  results,
  getKey,
  renderResult,
  onSelect,
  status,
  autoFocus,
  className,
}: SearchPickerProps<T>) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);

  const open =
    focused &&
    !dismissed &&
    value.trim() !== '' &&
    (results.length > 0 || Boolean(status));
  // Results arrive after the keystroke that asked for them, so a highlight
  // past the end of a shorter list means nothing is highlighted.
  const activeIndex = active < results.length ? active : -1;
  const optionId = (index: number) => `${listId}-${index}`;

  function pick(result: T) {
    setDismissed(true);
    onSelect(result);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setDismissed(true);
      return;
    }
    if (results.length === 0) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setDismissed(false);
      // Nothing highlighted is a stop too, so the keys cycle through the
      // results and back to the field alone: -1, 0, ..., last, -1.
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const stops = results.length + 1;
      setActive(((activeIndex + 1 + step + stops) % stops) - 1);
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      pick(results[Math.max(activeIndex, 0)]);
    }
  }

  return (
    <div className={cx('relative', className)}>
      <TextInput
        aria-label={ariaLabel}
        placeholder={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && activeIndex >= 0 ? optionId(activeIndex) : undefined
        }
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        autoFocus={autoFocus}
        icon={<SearchIcon className="text-lg" />}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(-1);
          setDismissed(false);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />

      <div
        hidden={!open}
        className="absolute inset-x-0 top-full z-10 mt-1.5 max-h-[60dvh] overflow-y-auto rounded-md border border-line bg-surface shadow-popover"
        // Pressing a result would otherwise blur the field first, closing
        // the panel before the press lands.
        onMouseDown={(event) => event.preventDefault()}
      >
        {results.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={resultsLabel}
            className="[&>li:last-child>*]:border-b-0"
          >
            {results.map((result, index) => (
              <li
                key={getKey(result)}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => pick(result)}
                onMouseMove={() => setActive(index)}
                className={cx(
                  'cursor-pointer',
                  index === activeIndex && 'bg-surface-2',
                )}
              >
                {renderResult(result)}
              </li>
            ))}
          </ul>
        ) : (
          <p
            id={listId}
            role="status"
            className="px-4 py-3.5 text-sm leading-prose text-muted"
          >
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
