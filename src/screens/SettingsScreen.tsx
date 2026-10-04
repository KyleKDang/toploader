import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { AppShell, Button, FormError, Sheet, TopBar } from '../components';
import {
  blockedTradersQuery,
  deleteAccount,
  unblockTrader,
} from '../lib/queries';
import { useTabs } from '../lib/tabs';

/*
 * Settings: what a Trader does to their account rather than with it - the
 * Traders they have blocked, and deleting the account.
 *
 * It is the Profile tab's screen until the profile itself has one (#27),
 * because deleting an account has to be somewhere a Trader can find without
 * being told the address.
 *
 * Deleting is confirmed in a sheet, with the destructive action second. The
 * sheet says what goes and, as plainly, what stays: a trade is the other
 * trader's record of it too, so it stays theirs with this Trader's name on
 * it, and a Trader should hear that before they confirm rather than assume
 * that deleting takes everything.
 *
 * Unblocking is not confirmed: it gives back what the block took, and a
 * Trader who unblocks by mistake can block again from the same places they
 * blocked from.
 */

const route = getRouteApi('/settings');

export function SettingsScreen() {
  const { traderId } = route.useLoaderData();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const blocked = useQuery(blockedTradersQuery(traderId)).data ?? [];

  const unblock = useMutation({
    mutationFn: unblockTrader,
    onSuccess: async () => {
      // Their Listings and the Matches with them come back to every other
      // screen, so what those screens cached without them is dropped, for
      // the reason a block drops it.
      queryClient.removeQueries({ queryKey: ['listing'] });
      queryClient.removeQueries({ queryKey: ['listings'] });
      queryClient.removeQueries({ queryKey: ['matches'] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['blocks'] }),
        queryClient.invalidateQueries({
          queryKey: blockedTradersQuery(traderId).queryKey,
        }),
      ]);
    },
  });

  const deletion = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      // Everything cached was read as the Trader who is now gone.
      queryClient.clear();
      await navigate({ to: '/sign-up' });
    },
  });

  return (
    <AppShell header={<TopBar title="Settings" />} {...useTabs('profile')}>
      <section aria-labelledby="blocked-traders" className="flex flex-col pt-4">
        <h2
          id="blocked-traders"
          className="px-4 pb-2 text-base font-bold text-ink"
        >
          Blocked traders
        </h2>
        {blocked.length === 0 ? (
          <p className="px-4 text-sm leading-prose text-muted">
            You have not blocked anyone.
          </p>
        ) : (
          <ul>
            {blocked.map((trader) => (
              <li
                key={trader.id}
                className="flex min-h-row items-center gap-3.5 border-b border-line px-4 py-2.5"
              >
                <span className="min-w-0 grow truncate font-bold text-ink">
                  {trader.display_name}
                </span>
                <Button
                  className="flex-none"
                  aria-label={`Unblock ${trader.display_name}`}
                  disabled={unblock.isPending}
                  onClick={() => unblock.mutate(trader.id)}
                >
                  {unblock.isPending && unblock.variables === trader.id
                    ? 'Unblocking…'
                    : 'Unblock'}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <FormError error={unblock.error} className="mt-2 px-4" />
      </section>

      <section
        aria-labelledby="delete-account"
        className="flex flex-col gap-2 px-4 py-4"
      >
        <h2 id="delete-account" className="text-base font-bold text-ink">
          Delete account
        </h2>
        <p className="text-sm leading-prose text-muted">
          Deletes your collection, wants, and listings, and signs you out.
          Trades you were part of stay with the other trader. This cannot be
          undone.
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
              disabled={deletion.isPending}
              onClick={() => deletion.mutate()}
            >
              {deletion.isPending ? 'Deleting…' : 'Delete account'}
            </Button>
          </>
        }
      >
        <p className="text-base leading-prose text-ink">
          Your collection, wants, and listings will be deleted, and any trade
          still open will be cancelled.
        </p>
        <p className="mt-2 text-base leading-prose text-ink">
          Trades you were part of stay with the other trader, with your display
          name, the cards you traded, and your messages. They are that
          trader&rsquo;s record of the trade.
        </p>
        <p className="mt-2 text-base leading-prose text-ink">
          This cannot be undone.
        </p>
        <FormError error={deletion.error} className="mt-2" />
      </Sheet>
    </AppShell>
  );
}
