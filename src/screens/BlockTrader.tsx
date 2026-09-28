import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, FormError, Sheet } from '../components';
import { blockTrader } from '../lib/queries';

/*
 * Blocking another Trader, from anywhere a Trader meets one: their Listing,
 * or a Trade with them.
 *
 * A block is confirmed in a sheet, with the destructive action second, since
 * it cannot be taken back. The sheet says what it does in the Trader's
 * terms, including what it leaves alone: a Trade already open between the
 * two can still be ended, so nobody is left holding cards on a Trade that
 * can never finish.
 */

export function BlockTrader({
  trader,
  onBlocked,
}: {
  trader: { id: string; name: string };
  /** What the screen does once the block holds, before the sheet closes. */
  onBlocked: () => Promise<void> | void;
}) {
  const [confirming, setConfirming] = useState(false);

  const block = useMutation({
    mutationFn: () => blockTrader(trader.id),
    onSuccess: async () => {
      await onBlocked();
      setConfirming(false);
    },
  });

  return (
    <>
      <div className="flex">
        <Button onClick={() => setConfirming(true)}>Block {trader.name}</Button>
      </div>

      <Sheet
        open={confirming}
        title={`Block ${trader.name}?`}
        onClose={() => setConfirming(false)}
        actions={
          <>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={block.isPending}
              onClick={() => block.mutate()}
            >
              {block.isPending ? 'Blocking…' : 'Block'}
            </Button>
          </>
        }
      >
        <p className="text-base leading-prose text-ink">
          You will stop seeing each other&rsquo;s listings and matches, and
          neither of you can propose a trade or send a message to the other. Any
          trade already open between you can still be declined, cancelled, or
          completed.
        </p>
        <p className="mt-2 text-base leading-prose text-ink">
          {trader.name} is not told. This cannot be undone.
        </p>
        <FormError error={block.error} />
      </Sheet>
    </>
  );
}
