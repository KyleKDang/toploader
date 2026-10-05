import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, FormError, Sheet, TextArea } from '../components';
import { reportListing, reportTrader } from '../lib/queries';

/*
 * Reporting another Trader to the Founders, from where a Trader meets one:
 * a Trade with them, or one of their Listings, which reports the Trader
 * with it.
 *
 * The reason is the Trader's own words rather than a category picked from a
 * list: the Founders read every report themselves, and "what happened" is
 * what they need to act on. The sheet says who reads it and that the other
 * Trader is not told, since that is what a Trader weighs before reporting
 * someone they may still have to meet.
 *
 * Once sent, the button gives way to a line saying so. Nothing else comes
 * back: a report is the Founders' to read, its reporter's included.
 *
 * It takes its share of the row it sits in, beside Block, since buttons in
 * a row are equal width.
 */

const MAX_REASON = 1000;

type Kind = 'trader' | 'listing';

/** What reporting each kind of thing sends, and how the sheet names it. */
const KINDS: Record<
  Kind,
  {
    send: (id: string, reason: string) => Promise<void>;
    button: (name: string) => string;
    title: (name: string) => string;
  }
> = {
  trader: {
    send: reportTrader,
    button: (name) => `Report ${name}`,
    title: (name) => `Report ${name}?`,
  },
  listing: {
    send: reportListing,
    button: () => 'Report listing',
    title: () => 'Report this listing?',
  },
};

export function Report({
  kind,
  id,
  name,
}: {
  kind: Kind;
  /** The Trader's id, or the Listing's. */
  id: string;
  /** The Trader reported, or the Trader whose Listing it is. */
  name: string;
}) {
  const [composing, setComposing] = useState(false);
  const [reason, setReason] = useState('');
  const { send, button, title } = KINDS[kind];

  const report = useMutation({
    mutationFn: () => send(id, reason),
    onSuccess: () => setComposing(false),
  });

  if (report.isSuccess) {
    return (
      <p className="flex-1 text-sm leading-prose text-muted">
        Reported. The founders will take a look.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-1">
        <Button onClick={() => setComposing(true)}>{button(name)}</Button>
      </div>

      <Sheet
        open={composing}
        title={title(name)}
        onClose={() => setComposing(false)}
        actions={
          <>
            <Button onClick={() => setComposing(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={report.isPending || reason.trim() === ''}
              onClick={() => report.mutate()}
            >
              {report.isPending ? 'Sending…' : 'Send report'}
            </Button>
          </>
        }
      >
        <TextArea
          label="What happened?"
          value={reason}
          maxLength={MAX_REASON}
          onChange={(event) => setReason(event.target.value)}
        />
        <p className="mt-3 text-base leading-prose text-ink">
          Only the founders read reports, and {name} is not told who reported
          them.
        </p>
        <FormError error={report.error} />
      </Sheet>
    </>
  );
}
