import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import {
  AppShell,
  Button,
  CardTile,
  ChipGroup,
  EmptyState,
  FormError,
  ListRow,
  PlusIcon,
  StatStrip,
  Stepper,
  TopBar,
} from '../components';
import { CONDITION_NAMES, CONDITIONS, type Condition } from '../lib/conditions';
import { formatDay, formatPrice } from '../lib/format';
import {
  cardCollectionQuery,
  collectionKey,
  type BrowsedListing,
  type CardCollectionEntry,
  type CatalogCard,
} from '../lib/queries';
import { supabase } from '../lib/supabase';
import { useTabs } from '../lib/tabs';
import { CardSearchField } from './CardSearchField';
import { CollectionLink } from './CollectionLink';

/*
 * A Card's page: its image, its Variants, the Market Price of the one
 * chosen, and the way a Copy of it enters a Trader's Collection - Variant,
 * then Condition, then how many. The Catalog search stays open above it, so
 * the next Card is one search away. It sits in the Search tab, the way the
 * chosen mockup draws it.
 *
 * The Market Price is a daily reference and says so: "updated daily", and
 * the day the sync last confirmed it, so a price the upstream stopped
 * sending shows its age rather than passing for today's (ADR-0003). It is
 * never called live.
 *
 * The mockup prices each Condition. The Catalog does not: TCGCSV prices a
 * Variant, so one Market Price covers every Condition of it, and a Condition
 * chip carries no price of its own rather than inventing one.
 *
 * Under that, what the Card is for a Trader beyond owning one: the way to
 * list a Copy of it, the way to want it, and who in their City is already
 * listing one.
 *
 * Wanting the Card happens on the Wants screen rather than here: this hands
 * that screen the Card, and the Variant and minimum Condition are chosen
 * there, since both are optional for a Want and the Variant chips above are
 * not.
 */

const route = getRouteApi('/cards/$cardId');

/**
 * The quantity a Collection entry can hold, which collection_entries checks
 * (see its migration). An entry can reach it through repeated adds, so the
 * control that corrects an entry has to be able to reach it too.
 */
const MAX_COPIES = 9999;

/** One add is a handful of Copies; a bigger number is a correction. */
const MAX_PER_ADD = 99;

export function CardScreen() {
  const { traderId, card, listings } = route.useLoaderData();

  return (
    <AppShell
      header={<TopBar title="Search" action={<CollectionLink />} />}
      {...useTabs('search')}
    >
      <CardSearchField />
      {card ? (
        // Keyed on the Card, so opening another one starts on its own first
        // Variant rather than carrying over the last Card's choice.
        <CardDetails
          key={card.id}
          card={card}
          traderId={traderId}
          listings={listings}
        />
      ) : (
        <EmptyState
          title="That card is not in the catalog"
          hint="Search for it by its name or collector number."
        />
      )}
    </AppShell>
  );
}

function CardDetails({
  card,
  traderId,
  listings,
}: {
  card: CatalogCard;
  traderId: string;
  listings: BrowsedListing[];
}) {
  const navigate = useNavigate();
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

      <StatStrip
        name="Market Price"
        label="Market Price · updated daily"
        // The chips' touch boxes already carry space under them.
        className={variant ? 'mt-1.5' : 'mt-3.5'}
      >
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
      </StatStrip>

      {variant ? (
        <AddToCollection
          card={card}
          variantId={variant.id}
          traderId={traderId}
        />
      ) : null}

      {/* Both secondary, side by side and so equal width: adding a Copy to
          the Collection is the primary on this screen, and the design system
          allows one per screen area. */}
      <div className="mt-3.5 flex gap-2 px-4">
        <Button
          onClick={() =>
            void navigate({
              to: '/cards/$cardId/list',
              params: { cardId: String(card.id) },
            })
          }
        >
          List this card
        </Button>
        <Button
          onClick={() =>
            void navigate({ to: '/wants', search: { card: card.id } })
          }
        >
          Add to wants
        </Button>
      </div>

      <CityListings listings={listings} />
    </>
  );
}

/**
 * Picking a Condition and a quantity, adding that Copy, and correcting what
 * the Trader already holds of this Card. A Collection entry is one Variant
 * in one Condition, so the Copies below are the same shape as the control
 * above them.
 */
function AddToCollection({
  card,
  variantId,
  traderId,
}: {
  card: CatalogCard;
  variantId: number;
  traderId: string;
}) {
  const queryClient = useQueryClient();
  const [condition, setCondition] = useState<Condition>('NM');
  const [quantity, setQuantity] = useState(1);

  const owned = useQuery(
    cardCollectionQuery(
      traderId,
      card.id,
      card.card_variants.map(({ id }) => id),
    ),
  );

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: collectionKey(traderId) });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('add_to_collection', {
        card_variant_id: variantId,
        condition,
        quantity,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setQuantity(1);
      await refresh();
    },
  });

  return (
    <>
      <ChipGroup
        label="Condition"
        options={CONDITIONS.map((value) => ({ value, label: value }))}
        value={condition}
        onChange={setCondition}
        className="mt-3.5 px-4"
      />
      {/* The scale is initials on the chips, because that is how collectors
          write it; the one chosen is spelled out here, so nobody has to
          know what MP stands for. */}
      <p className="px-4 text-sm text-muted">{CONDITION_NAMES[condition]}</p>

      <div className="mt-3.5 flex items-center justify-between gap-2 px-4">
        {/* The stepper's own group is named "Quantity" too, so this word is
            the visible half of that one label rather than a second one. */}
        <span aria-hidden="true" className="text-base font-semibold text-ink">
          Quantity
        </span>
        <Stepper
          label="Quantity"
          value={quantity}
          onChange={setQuantity}
          max={MAX_PER_ADD}
        />
      </div>

      <div className="mt-3 flex px-4">
        <Button
          variant="primary"
          icon={<PlusIcon className="text-lg" />}
          disabled={add.isPending}
          onClick={() => add.mutate()}
        >
          Add to collection
        </Button>
      </div>
      <FormError error={add.error} className="px-4" />

      {owned.data && owned.data.length > 0 ? (
        <OwnedCopies card={card} entries={owned.data} onChanged={refresh} />
      ) : null}
    </>
  );
}

function OwnedCopies({
  card,
  entries,
  onChanged,
}: {
  card: CatalogCard;
  entries: readonly CardCollectionEntry[];
  onChanged: () => Promise<void>;
}) {
  const setQuantity = useMutation({
    // One scope, so rapid taps on a stepper queue rather than race: this RPC
    // sets a quantity outright, and out of order the slower write would be
    // the one that stuck.
    scope: { id: 'collection-quantity' },
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      const { error } = await supabase.rpc('set_collection_quantity', {
        entry_id: id,
        quantity,
      });
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('remove_from_collection', {
        entry_id: id,
      });
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  const variantName = (id: number) =>
    card.card_variants.find((variant) => variant.id === id)?.name ?? '';

  return (
    <section className="mt-5 border-t border-line pb-4 pt-4">
      <h3 className="px-4 text-base font-bold text-ink">In your collection</h3>

      <ul>
        {entries.map((entry) => {
          const name = variantName(entry.card_variant_id);
          // The tap a Trader just made, until the write that follows it
          // lands, so the number under their finger moves when they press.
          const pending =
            setQuantity.isPending && setQuantity.variables?.id === entry.id
              ? setQuantity.variables.quantity
              : entry.quantity;

          return (
            <li key={entry.id} className="px-4 pt-3.5">
              <p className="truncate text-base text-ink">
                {name} · {CONDITION_NAMES[entry.condition]}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Stepper
                  label={`Copies of ${name} in ${CONDITION_NAMES[entry.condition]}`}
                  value={pending}
                  onChange={(quantity) =>
                    setQuantity.mutate({ id: entry.id, quantity })
                  }
                  max={MAX_COPIES}
                />
                <Button
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(entry.id)}
                >
                  Remove
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <FormError
        error={setQuantity.error ?? remove.error}
        className="px-4 pt-3.5"
      />
    </section>
  );
}

/*
 * Who in the Trader's City is listing this Card. RLS is what makes it their
 * City and only live Listings; this just shows what came back.
 *
 * Each row carries the thumbnail rather than the full-size photo. A popular
 * Card can fill this list, and full-size images in a feed are what actually
 * spends the free tier's egress (ADR-0006).
 *
 * The thumbnails take empty alt text: the row beside them already says whose
 * card it is and what condition it is in, so naming it again is noise to a
 * screen reader. The alt text the design system asks for rides the full-size
 * photos on the Listing's own page, where nothing else carries it.
 */
function CityListings({ listings }: { listings: BrowsedListing[] }) {
  const navigate = useNavigate();

  return (
    <section aria-label="Listings in your area" className="mt-5">
      <h3 className="px-4 pb-1.5 text-sm font-semibold text-muted">
        Listed in your area
      </h3>

      {listings.length === 0 ? (
        <p className="px-4 pb-4 text-base leading-prose text-ink">
          Nobody in your area is listing this card yet.
        </p>
      ) : (
        <ul>
          {listings.map((listing) => (
            <li key={listing.id}>
              <ListRow
                leading={<CardTile src={listing.thumbnailUrl} alt="" />}
                title={listing.trader?.display_name ?? 'A trader'}
                trailing={
                  listing.asking_price_cents !== null ? (
                    <span className="tabular-nums">
                      {formatPrice(listing.asking_price_cents)}
                    </span>
                  ) : null
                }
                detail={[
                  listing.condition,
                  listing.card_variants.name,
                  listing.open_to_cash_offers ? 'Open to cash offers' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                relation={
                  listing.status === 'in_trade' ? 'In a trade' : undefined
                }
                onClick={() =>
                  void navigate({
                    to: '/listings/$listingId',
                    params: { listingId: listing.id },
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
