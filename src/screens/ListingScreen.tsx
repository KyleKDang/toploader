import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useRouter } from '@tanstack/react-router';
import {
  AppShell,
  Badge,
  Button,
  EmptyState,
  FormError,
  Sheet,
  TopBar,
} from '../components';
import { CONDITION_NAMES } from '../lib/conditions';
import { formatPrice } from '../lib/format';
import type { ListingDetail } from '../lib/queries';
import { withdrawListing } from '../lib/queries';
import { useTabs } from '../lib/tabs';

/*
 * One Listing: the photographs of the actual Copy, what it is, and what the
 * Trader wants for it.
 *
 * The photos are shown whole and uncropped on --color-surface, per the
 * design system's photo treatment: a Listing photo is evidence of the card's
 * condition, so nothing may crop away the corner a Trader is looking for.
 * Every photo carries alt text naming the Card and its Condition.
 *
 * Its own Trader gets the way out: withdrawing is the one transition a
 * Trader owns, and it is where a Listing stops - so it is confirmed in a
 * sheet, with the destructive action second.
 */

const route = getRouteApi('/listings/$listingId');

/** How a Listing that is not plainly available reads on screen. */
const STATUS_LABELS = {
  active: null,
  in_trade: 'In a trade',
  traded: 'Traded',
  withdrawn: 'Withdrawn',
} as const;

export function ListingScreen() {
  const { listing, traderId } = route.useLoaderData();
  const router = useRouter();
  const tabs = useTabs('search');

  const header = (
    <TopBar title="Listing" onBack={() => router.history.back()} />
  );

  if (!listing) {
    return (
      <AppShell header={header} {...tabs}>
        <EmptyState
          title="That listing is not available"
          hint="It may have been withdrawn, or it belongs to another area."
        />
      </AppShell>
    );
  }

  return (
    <AppShell header={header} {...tabs}>
      <Listing listing={listing} isOwn={listing.trader_id === traderId} />
    </AppShell>
  );
}

function Listing({
  listing,
  isOwn,
}: {
  listing: ListingDetail;
  isOwn: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const card = listing.card_variants?.cards;
  const condition = CONDITION_NAMES[listing.condition];
  const title = card?.name ?? 'This card';

  const withdraw = useMutation({
    mutationFn: () => withdrawListing(listing.id),
    onSuccess: async () => {
      setConfirming(false);
      // The cache first, then the loaders. A route loader reads through
      // ensureQueryData, which hands back whatever the cache holds; marking
      // an entry stale does not move it, because nothing is observing this
      // query to refetch it. Dropping the entries is what makes the reload
      // actually read the withdrawn Listing back.
      queryClient.removeQueries({ queryKey: ['listing'] });
      queryClient.removeQueries({ queryKey: ['listings'] });
      await router.invalidate();
    },
  });

  const status = STATUS_LABELS[listing.status];

  return (
    <>
      <ul aria-label="Photos of this card" className="flex flex-col gap-2 p-4">
        {listing.photoUrls.map((url, index) => (
          <li key={url}>
            <img
              src={url}
              alt={`${title}, ${condition}, photo ${index + 1}`}
              className="w-full rounded-md bg-surface"
            />
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-1.5 px-4">
        <div className="flex items-baseline justify-between gap-2.5">
          <h2 className="min-w-0 text-lg font-bold text-ink">{title}</h2>
          {listing.asking_price_cents !== null ? (
            <p className="shrink-0 text-lg font-bold tabular-nums text-ink">
              {formatPrice(listing.asking_price_cents)}
            </p>
          ) : null}
        </div>

        <p className="text-sm text-muted">
          {[
            card?.card_sets.name,
            card?.number,
            listing.card_variants?.name,
            condition,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <div className="mt-0.75 flex flex-wrap items-center gap-2">
          {status ? <Badge>{status}</Badge> : null}
          {listing.open_to_cash_offers ? (
            <Badge>Open to cash offers</Badge>
          ) : null}
        </div>

        <p className="mt-1.5 text-base text-ink">
          {isOwn
            ? 'Your listing.'
            : `Listed by ${listing.trader?.display_name ?? 'a trader'}.`}
        </p>
        {listing.asking_price_cents !== null || listing.open_to_cash_offers ? (
          <p className="text-sm leading-prose text-muted">
            Any cash is handled in person between the two of you. The app never
            takes a payment.
          </p>
        ) : null}
      </section>

      {isOwn && listing.status === 'active' ? (
        <div className="flex px-4 pt-4 pb-6">
          <Button onClick={() => setConfirming(true)}>
            Withdraw this listing
          </Button>
        </div>
      ) : null}

      <Sheet
        open={confirming}
        title="Withdraw this listing?"
        onClose={() => setConfirming(false)}
        actions={
          <>
            <Button onClick={() => setConfirming(false)}>Keep it</Button>
            <Button
              variant="primary"
              disabled={withdraw.isPending}
              onClick={() => withdraw.mutate()}
            >
              {withdraw.isPending ? 'Withdrawing…' : 'Withdraw'}
            </Button>
          </>
        }
      >
        <p className="text-base leading-prose text-ink">
          It leaves your area&rsquo;s listings, and its photos are deleted
          within a day. You cannot put this one back up, but you can list the
          card again.
        </p>
        <FormError error={withdraw.error} />
      </Sheet>
    </>
  );
}
