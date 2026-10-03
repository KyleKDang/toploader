import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AppShell, Button, FormError, Sheet, TopBar } from '../components';
import { deleteAccount } from '../lib/queries';
import { useTabs } from '../lib/tabs';

/*
 * Settings: what a Trader does to their account rather than with it. For
 * now that is one thing, deleting it.
 *
 * It is the Profile tab's screen until the profile itself has one (#27),
 * because deleting an account has to be somewhere a Trader can find without
 * being told the address.
 *
 * Deleting is confirmed in a sheet, with the destructive action second. The
 * sheet says what goes and, as plainly, what stays: a completed trade is the
 * other trader's record of it, so it stays theirs with this Trader's name on
 * it, and a Trader should hear that before they confirm rather than assume
 * that deleting takes everything.
 */

export function SettingsScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      // Everything cached was read as the Trader who is now gone.
      queryClient.clear();
      await navigate({ to: '/sign-up' });
    },
  });

  return (
    <AppShell header={<TopBar title="Settings" />} {...useTabs('profile')}>
      <section
        aria-labelledby="delete-account"
        className="flex flex-col gap-2 px-4 py-4"
      >
        <h2 id="delete-account" className="text-base font-bold text-ink">
          Delete account
        </h2>
        <p className="text-sm leading-prose text-muted">
          Removes your profile, collection, wants, and listings, and signs you
          out. This cannot be undone.
        </p>
        <div className="mt-2 flex">
          <Button onClick={() => setConfirming(true)}>Delete account</Button>
        </div>
      </section>

      <Sheet
        open={confirming}
        title="Delete your account?"
        onClose={() => setConfirming(false)}
        actions={
          <>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? 'Deleting…' : 'Delete account'}
            </Button>
          </>
        }
      >
        <p className="text-base leading-prose text-ink">
          Your profile, collection, wants, and listings will be deleted, and any
          trade still open will be cancelled.
        </p>
        <p className="mt-2 text-base leading-prose text-ink">
          Trades you completed stay with the traders you made them with,
          including your display name and your messages. They are the other
          trader&rsquo;s record of the trade.
        </p>
        <p className="mt-2 text-base leading-prose text-ink">
          This cannot be undone.
        </p>
        <FormError error={remove.error} className="mt-2" />
      </Sheet>
    </AppShell>
  );
}
