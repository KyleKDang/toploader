import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CardTile, ListRow, SearchPicker } from '../components';
import { messageForTrader } from '../lib/errors';
import { formatPrice } from '../lib/format';
import { cardSearchQuery } from '../lib/queries';
import { useDebouncedValue } from '../lib/useDebouncedValue';

/*
 * The Catalog search at the top of the Search tab: the only way a Trader
 * finds a Card in v1. Typing searches the whole Catalog on the server once
 * the Trader pauses, and picking a result opens that Card's page.
 *
 * Each result reads as it will on the card page: the Variant it names is the
 * one the page opens on, and the price beside it is that Variant's.
 */

/** Long enough to mean something; one letter matches half the Catalog. */
const MIN_QUERY_LENGTH = 2;
const TYPING_PAUSE_MS = 200;

export function CardSearchField({ autoFocus }: { autoFocus?: boolean }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const query = useDebouncedValue(text.trim(), TYPING_PAUSE_MS);
  const searching = query.length >= MIN_QUERY_LENGTH;

  const search = useQuery({
    ...cardSearchQuery(query),
    enabled: searching,
    // The last results stay up while the next ones load, so the panel does
    // not flicker shut between keystrokes.
    placeholderData: keepPreviousData,
  });
  const results = searching ? (search.data ?? []) : [];

  let status: string | undefined;
  if (!searching) status = undefined;
  else if (search.isError) status = messageForTrader(search.error);
  else if (search.isPending) status = 'Searching…';
  else if (results.length === 0) status = `No cards match “${query}”.`;

  return (
    <div className="px-4 pt-2.5">
      <SearchPicker
        aria-label="Search the catalog"
        resultsLabel="Cards"
        value={text}
        onChange={setText}
        results={results}
        getKey={(card) => card.id}
        status={status}
        autoFocus={autoFocus}
        onSelect={(card) => {
          setText('');
          void navigate({
            to: '/cards/$cardId',
            params: { cardId: String(card.id) },
          });
        }}
        renderResult={(card) => {
          const variant = card.card_variants[0];
          return (
            <ListRow
              picker
              leading={<CardTile src={card.image_url} alt="" size="sm" />}
              title={card.name}
              trailing={
                variant?.market_price_cents != null ? (
                  <span className="tabular-nums">
                    {formatPrice(variant.market_price_cents)}
                  </span>
                ) : null
              }
              detail={[`${card.card_sets.name} ${card.number}`, variant?.name]
                .filter(Boolean)
                .join(' · ')}
            />
          );
        }}
      />
    </div>
  );
}
