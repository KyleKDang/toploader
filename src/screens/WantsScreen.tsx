import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import {
  AppShell,
  Button,
  CardTile,
  ChipGroup,
  EmptyState,
  FormError,
  ListRow,
  TopBar,
} from '../components';
import { CONDITION_NAMES, CONDITIONS, type Condition } from '../lib/conditions';
import { wantsQuery, type CatalogCard, type Want } from '../lib/queries';
import { supabase } from '../lib/supabase';
import { useTabs } from '../lib/tabs';
import { CardSearchField } from './CardSearchField';

/*
 * Wants: the Cards a Trader is looking for, and the half of Matching a
 * Listing is matched against (#19).
 *
 * The same Catalog search picker the Search tab uses sits at the top, but
 * picking a result narrows it into a Want here rather than opening the
 * Card's page. Both narrowings are optional and both default to "any", which
 * is the Want a Trader means when they just want the Card: the spec's
 * requirement is the Card, and the Variant and minimum Condition only ever
 * cut down what satisfies it.
 *
 * A Want is private. Nothing here is visible to another Trader, and
 * Matching will show only the pairing a Want produced, never the list.
 */

const route = getRouteApi('/wants');

/** The chip value standing for "do not narrow on this at all". */
const ANY = 'any';

export function WantsScreen() {
  const { trader, traderId, card } = route.useLoaderData();
  const navigate = route.useNavigate();
  const wants = useQuery(wantsQuery(traderId));

  /*
   * The Card being narrowed into a Want, held in the URL rather than in
   * state, so the card page's "Add to wants" arrives here on the same footing
   * as a pick from the search field, and so backing out of the panel is the
   * back button.
   */
  function pickCard(cardId: number | undefined) {
    void navigate({ search: cardId === undefined ? {} : { card: cardId } });
  }

  return (
    <AppShell header={<TopBar title="Wants" />} {...useTabs('profile')}>
      <CardSearchField onSelect={pickCard} />

      {card ? (
        <AddWant
          // Keyed on the Card, so picking another one starts on its own
          // "any" defaults rather than carrying over the last Card's.
          key={card.id}
          card={card}
          traderId={traderId}
          onDone={() => pickCard(undefined)}
        />
      ) : null}

      {wants.isPending ? null : wants.isError ? (
        <div className="px-4 pt-4">
          <FormError error={wants.error} />
        </div>
      ) : wants.data.length === 0 ? (
        <EmptyState
          title="No wants yet"
          hint={`Search for a card above, and traders in ${trader.city.name} who list one show up in Matches.`}
        />
      ) : (
        <ul aria-label="Wants">
          {wants.data.map((want) => (
            <li key={want.id}>
              <WantRow want={want} traderId={traderId} />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

/**
 * Narrowing one Card into a Want. Both chip groups open on "Any", so the
 * Trader who just wants the Card adds it without touching either.
 */
function AddWant({
  card,
  traderId,
  onDone,
}: {
  card: CatalogCard;
  traderId: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [variant, setVariant] = useState<number | typeof ANY>(ANY);
  const [condition, setCondition] = useState<Condition | typeof ANY>(ANY);

  const addWant = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('add_want', {
        card_id: card.id,
        card_variant_id: variant === ANY ? undefined : variant,
        min_condition: condition === ANY ? undefined : condition,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: wantsQuery(traderId).queryKey,
      });
      onDone();
    },
  });

  const variants = card.card_variants;

  return (
    <section
      aria-label={`Add ${card.name} to wants`}
      className="mt-2.5 border-y border-line bg-surface px-4 py-3.5"
    >
      <h2 className="text-base font-bold text-ink">{card.name}</h2>
      <p className="mt-0.5 text-sm text-muted">
        Narrow it if you want to. Leave both on “Any” to want the card however
        it comes.
      </p>

      {variants.length > 0 ? (
        <ChipGroup
          label="Variant"
          showLabel
          options={[
            { value: ANY, label: 'Any variant' },
            ...variants.map(({ id, name }) => ({ value: id, label: name })),
          ]}
          value={variant}
          onChange={setVariant}
          className="mt-2"
        />
      ) : null}

      <ChipGroup
        label="Minimum condition"
        showLabel
        options={[
          { value: ANY, label: 'Any condition' },
          ...CONDITIONS.map((value) => ({
            value,
            label: CONDITION_NAMES[value],
          })),
        ]}
        value={condition}
        onChange={setCondition}
        className="mt-1.5"
      />

      {addWant.error ? (
        <div className="mt-3">
          <FormError error={addWant.error} />
        </div>
      ) : null}

      <div className="mt-3 flex gap-2.5">
        <Button onClick={onDone}>Cancel</Button>
        <Button
          variant="primary"
          disabled={addWant.isPending}
          onClick={() => addWant.mutate()}
        >
          Add to wants
        </Button>
      </div>
    </section>
  );
}

function WantRow({ want, traderId }: { want: Want; traderId: string }) {
  const queryClient = useQueryClient();

  const removeWant = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('remove_want', { want_id: want.id });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: wantsQuery(traderId).queryKey,
      }),
  });

  return (
    <ListRow
      leading={<CardTile src={want.card.image_url} alt="" size="sm" />}
      title={want.card.name}
      detail={[want.card.card_sets.name, want.card.number]
        .filter(Boolean)
        .join(' · ')}
      relation={describeNarrowing(want)}
      // The narrowing is the whole point of the row, and a Wants list is
      // short, so line 3 is read in full rather than truncated.
      wrapRelation
      relationTrailing={
        <button
          type="button"
          // The row is not itself tappable, so this control carries its own
          // touch target rather than inheriting the row's.
          className="-my-2 min-h-tap px-2 text-sm font-semibold text-muted"
          disabled={removeWant.isPending}
          onClick={() => removeWant.mutate()}
        >
          Remove
        </button>
      }
    />
  );
}

/** What a Want is narrowed to, in the words the chips used to set it. */
function describeNarrowing(want: Want): string {
  return [
    want.card_variant ? want.card_variant.name : 'Any variant',
    want.min_condition
      ? `${CONDITION_NAMES[want.min_condition]} or better`
      : 'Any condition',
  ].join(' · ');
}
