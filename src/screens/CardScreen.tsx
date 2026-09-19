import { useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import {
  AppShell,
  CardTile,
  ChipGroup,
  EmptyState,
  TopBar,
} from '../components';
import { cx } from '../lib/cx';
import { formatDay, formatPrice } from '../lib/format';
import type { CatalogCard } from '../lib/queries';
import { useTabs } from '../lib/tabs';
import { CardSearchField } from './CardSearchField';

/*
 * A Card's page: its image, its Variants, and the Market Price of the one
 * chosen, with the Catalog search still open above it so the next Card is
 * one search away. It sits in the Search tab, the way the chosen mockup
 * draws it.
 *
 * The Market Price is a daily reference and says so: "updated daily", and
 * the day the sync last confirmed it, so a price the upstream stopped
 * sending shows its age rather than passing for today's (ADR-0003). It is
 * never called live.
 *
 * Condition prices, who in the City lists or wants the Card, and adding it
 * to a Collection or Wants are later tickets (#16, #17, #18).
 */

const route = getRouteApi('/cards/$cardId');

export function CardScreen() {
  const { card } = route.useLoaderData();

  return (
    <AppShell header={<TopBar title="Search" />} {...useTabs('search')}>
      <CardSearchField />
      {card ? (
        // Keyed on the Card, so opening another one starts on its own first
        // Variant rather than carrying over the last Card's choice.
        <CardDetails key={card.id} card={card} />
      ) : (
        <EmptyState
          title="That card is not in the catalog"
          hint="Search for it by its name or collector number."
        />
      )}
    </AppShell>
  );
}

function CardDetails({ card }: { card: CatalogCard }) {
  const variants = card.card_variants;
  const [variantId, setVariantId] = useState(variants[0]?.id);
  const variant = variants.find(({ id }) => id === variantId);

  return (
    <>
      <section className="flex items-start gap-3.5 px-4 pt-4">
        <CardTile src={card.image_url} alt={card.name} size="lg" />
        <div className="min-w-0 grow">
          <h2 className="text-lg font-bold text-ink">{card.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {[card.card_sets.name, card.number, card.rarity]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </section>

      {/* Full width rather than beside the image: Variant names run long
          ("Reverse Holofoil"), and the column beside a 2x tile fits one. */}
      {variant ? (
        <ChipGroup
          label="Variant"
          options={variants.map(({ id, name }) => ({ value: id, label: name }))}
          value={variant.id}
          onChange={setVariantId}
          className="mt-1.5 px-4"
        />
      ) : null}

      <section
        aria-label="Market Price"
        className={cx(
          'mx-4 flex flex-col gap-0.5 rounded-md border border-line bg-surface px-3.5 py-3',
          // The chips' touch boxes already carry space under them.
          variant ? 'mt-1.5' : 'mt-3.5',
        )}
      >
        <p className="text-xs font-semibold text-muted">
          Market Price · updated daily
        </p>
        {variant?.market_price_cents != null &&
        variant.market_price_as_of != null ? (
          <>
            <p className="text-xl font-bold tabular-nums text-ink">
              {formatPrice(variant.market_price_cents)}
            </p>
            <p className="text-sm text-muted">
              {variant.name} · as of {formatDay(variant.market_price_as_of)}
            </p>
          </>
        ) : (
          <p className="text-base text-ink">
            No market price for {variant ? variant.name : 'this card'} yet.
          </p>
        )}
      </section>
    </>
  );
}
