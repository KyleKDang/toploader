import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, FormError, Sheet, TextInput } from '../components';
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
 */

const MAX_REASON = 1000;

type Subject =
  | { kind: 'trader'; id: string; name: string }
  | { kind: 'listing'; id: string; traderName: string };

export function Report({ subject }: { subject: Subject }) {
  const [composing, setComposing] = useState(false);
  const [reason, setReason] = useState('');

  const send = useMutation({
    mutationFn: () =>
      subject.kind === 'trader'
        ? reportTrader(subject.id, reason)
        : reportListing(subject.id, reason),
    onSuccess: () => setComposing(false),
  });

  const name = subject.kind === 'trader' ? subject.name : subject.traderName;

  if (send.isSuccess) {
    return (
      <p className="text-sm leading-prose text-muted">
        Reported. The founders will take a look.
      </p>
    );
  }

  return (
    <>
      <div className="flex">
        <Button onClick={() => setComposing(true)}>
          {subject.kind === 'trader' ? `Report ${name}` : 'Report listing'}
        </Button>
      </div>

      <Sheet
        open={composing}
        title={
          subject.kind === 'trader' ? `Report ${name}?` : 'Report this listing?'
        }
        onClose={() => setComposing(false)}
        actions={
          <>
            <Button onClick={() => setComposing(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={send.isPending || reason.trim() === ''}
              onClick={() => send.mutate()}
            >
              {send.isPending ? 'Sending…' : 'Send report'}
            </Button>
          </>
        }
      >
        <TextInput
          label="What happened?"
          value={reason}
          maxLength={MAX_REASON}
          onChange={(event) => setReason(event.target.value)}
        />
        <p className="mt-3 text-base leading-prose text-ink">
          Only the founders read reports, and {name} is not told who reported
          them.
        </p>
        <FormError error={send.error} />
      </Sheet>
    </>
  );
}
