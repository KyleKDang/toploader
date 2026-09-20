import { getRouteApi, useNavigate, useRouter } from '@tanstack/react-router';
import {
  AppShell,
  CardTile,
  EmptyState,
  ListRow,
  StatStrip,
  TopBar,
} from '../components';
import { formatPrice } from '../lib/format';
import type { CollectionEntry } from '../lib/queries';
import { useTabs } from '../lib/tabs';

/*
 * The Collection: every Copy a Trader owns, most recently added first, and
 * the one line saying what the lot is worth at Market Price. No charts and
 * no history view in v1.
 *
 * It is private. Nothing here is scoped by hand: the select policy on
 * collection_entries returns the caller's own rows and no others, so there
 * is no filter on this screen that could be forgotten.
 *
 * Each row opens its Card's page, which is where a Copy's quantity is
 * corrected or removed, beside the Variant and Condition controls that
 * created it.
 */

const route = getRouteApi('/collection');

export function CollectionScreen() {
  const { entries, value } = route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();

  return (
    <AppShell
      header={
        <TopBar
          title="Collection"
          onBack={() =>
            router.history.canGoBack()
              ? router.history.back()
              : void navigate({ to: '/search' })
          }
        />
      }
      {...useTabs('search')}
    >
      {entries.length === 0 ? (
        <EmptyState
          title="Nothing in your collection yet"
          hint="Find a card in search, then add the copies you own: variant, condition, and how many."
          action={{
            label: 'Find a card',
            onClick: () => void navigate({ to: '/search' }),
          }}
        />
      ) : (
        <>
          {value ? <TotalValue {...value} /> : null}
          <ul>
            {entries.map((entry) => (
              <li key={entry.id}>
                <Copy entry={entry} />
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}

/**
 * The single total-value line. It names Market Price as the daily reference
 * it is, the way the card page does, and counts the Copies the Catalog has
 * no price for rather than letting them pass as worth nothing.
 */
function TotalValue({
  copy_count,
  total_cents,
  unpriced_copy_count,
}: {
  copy_count: number;
  total_cents: number;
  unpriced_copy_count: number;
}) {
  return (
    <StatStrip
      name="Total value"
      label="Total value · at market price, updated daily"
      className="mt-3.5"
    >
      <p className="text-xl font-bold tabular-nums text-ink">
        {formatPrice(total_cents)}
      </p>
      <p className="text-sm text-muted">
        {copies(copy_count)}
        {unpriced_copy_count > 0
          ? ` · ${copies(unpriced_copy_count)} with no market price`
          : ''}
      </p>
    </StatStrip>
  );
}

function Copy({ entry }: { entry: CollectionEntry }) {
  const navigate = useNavigate();
  const variant = entry.card_variants;
  const card = variant.cards;
  const price = variant.market_price_cents;

  return (
    <ListRow
      leading={<CardTile src={card.image_url} alt="" />}
      title={card.name}
      trailing={price === null ? null : formatPrice(price * entry.quantity)}
      // The Variant and Condition lead, then the printing. A row truncates
      // rather than wrapping, and what a Trader owns is the part that has to
      // survive it; the set and collector number are what identify the
      // printing once they already know which Copy this is.
      detail={`${variant.name} · ${entry.condition} · ${card.card_sets.name} ${card.number}`}
      relation={
        price === null
          ? `${copies(entry.quantity)} · no market price yet`
          : // With one Copy the line-1 price is already the price of it.
            copies(entry.quantity) +
            (entry.quantity > 1 ? ` at ${formatPrice(price)} each` : '')
      }
      onClick={() =>
        void navigate({
          to: '/cards/$cardId',
          params: { cardId: String(card.id) },
        })
      }
    />
  );
}

function copies(count: number) {
  return `${count} ${count === 1 ? 'copy' : 'copies'}`;
}
