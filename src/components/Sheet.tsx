import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/*
 * Bottom sheet.
 *
 * Bottom sheets, not center modals - that is gate 1's app feel. --radius on
 * the top two corners, --shadow-sheet, a drag handle, a title row, and
 * content that scrolls inside the sheet.
 *
 * Dismiss is always available as a labeled control, never only by swipe, so
 * every sheet's actions include the way out; the handle is drawn because the
 * shape is familiar, not because it is the only way back.
 *
 * Underneath it is a native <dialog>, so focus is trapped inside the sheet,
 * Escape closes it, and the rest of the screen is inert - none of which is
 * worth reimplementing, and all of which a Trader using a screen reader
 * depends on.
 */

type SheetProps = {
  open: boolean;
  /** The title row. Says what the sheet is about in a few words. */
  title: string;
  /**
   * Closing without acting: the Escape key, and the backdrop. The labeled
   * control that does the same belongs in `actions`.
   */
  onClose: () => void;
  children: ReactNode;
  /**
   * The buttons along the bottom, side by side. A destructive confirmation
   * puts the destructive action second.
   */
  actions: ReactNode;
};

export function Sheet({ open, title, onClose, children, actions }: SheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    // showModal() is what makes it modal; React cannot express that as a
    // prop, so opening is an effect rather than a render.
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-label={title}
      onCancel={(event) => {
        // Escape would otherwise close the element without telling the
        // screen that owns `open`, which would then refuse to reopen it.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click that lands on the dialog itself is a click on the
        // backdrop: the sheet's own content sits in the child below.
        if (event.target === dialog.current) onClose();
      }}
      className="m-0 mt-auto max-h-full w-full max-w-none bg-transparent backdrop:bg-scrim sm:mx-auto sm:max-w-content"
    >
      <div className="flex max-h-dvh flex-col rounded-t-md border border-line bg-bg pb-5.5 shadow-sheet">
        <span
          aria-hidden="true"
          className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-line"
        />

        <h2 className="px-4 pt-2.5 pb-1 text-lg font-bold text-ink">{title}</h2>

        <div className="min-h-0 grow overflow-y-auto px-4 pb-2.5">
          {children}
        </div>

        <div className="flex gap-2 px-4 pt-1.5">{actions}</div>
      </div>
    </dialog>
  );
}
