-- The Catalog: our own copy of every Card, its Variants, its image, and a
-- Market Price history, synced daily from TCGCSV (ADR-0003). Clients only
-- ever read it. The sync job is its one writer, and it writes through the two
-- functions below, which only service_role may execute.
--
-- Every row has our own id, and TCGplayer's id sits beside it as a unique
-- column: that is what keeps the upstream swappable, since nothing downstream
-- (Collections, Listings, Wants) will ever reference an id we do not own.

create table public.card_sets (
  id integer generated always as identity primary key,
  tcgplayer_group_id integer not null unique,
  name text not null,
  abbreviation text,
  released_on date,
  -- The day of the last sync this set accepted: its last-good data.
  synced_as_of date not null
);

-- A Card is a printing, identified by set and collector number. Sealed
-- product never becomes a row here.
create table public.cards (
  id integer generated always as identity primary key,
  card_set_id integer not null references public.card_sets (id) on delete cascade,
  tcgplayer_product_id integer not null unique,
  name text not null,
  number text not null,
  rarity text,
  -- Hotlinked, not copied: 20k images would spend the Storage that Listing
  -- photos need.
  image_url text
);

create index cards_card_set_id_idx on public.cards (card_set_id);

-- A Variant is a print treatment of a Card: Normal, Holofoil, Reverse
-- Holofoil, 1st Edition. It carries its current Market Price, so showing a
-- price never has to search the history. market_price_as_of is the last day
-- a sync confirmed that price, which is how a stale price shows its age.
create table public.card_variants (
  id integer generated always as identity primary key,
  card_id integer not null references public.cards (id) on delete cascade,
  name text not null,
  market_price_cents integer check (market_price_cents >= 0),
  market_price_as_of date,
  unique (card_id, name),
  check ((market_price_cents is null) = (market_price_as_of is null))
);

-- Market Price history, changed-only: a sync writes a row for a day only when
-- the price it brings differs from the one the Variant held, so the price on
-- any day is the latest row on or before it. (A same-day correction back to
-- the earlier price can leave two equal rows in a row, which reads the same.) Rows are as narrow as they can be, because this
-- is the table that decides how long the free 500 MB lasts (ADR-0003).
create table public.price_snapshots (
  card_variant_id integer not null references public.card_variants (id) on delete cascade,
  as_of date not null,
  market_price_cents integer not null check (market_price_cents >= 0),
  primary key (card_variant_id, as_of)
);

-- No client role holds a privilege until granted below (deny_by_default), and
-- RLS filters whatever a grant lets through. Select is the only grant, so the
-- Catalog is read-only to every client.
alter table public.card_sets enable row level security;
alter table public.cards enable row level security;
alter table public.card_variants enable row level security;
alter table public.price_snapshots enable row level security;

grant select
  on public.card_sets, public.cards, public.card_variants, public.price_snapshots
  to authenticated;

create policy "Any signed-in Trader can read card sets"
  on public.card_sets for select to authenticated using (true);
create policy "Any signed-in Trader can read Cards"
  on public.cards for select to authenticated using (true);
create policy "Any signed-in Trader can read Variants"
  on public.card_variants for select to authenticated using (true);
create policy "Any signed-in Trader can read Market Price history"
  on public.price_snapshots for select to authenticated using (true);

-- Applies one set's sync, all or nothing: a set that fails any check below
-- raises, and the transaction leaves its last-good data exactly as it was.
-- Applying the same day twice changes nothing.
--
--   card_set  {groupId, name, abbreviation, releasedOn}
--   cards     [{productId, name, number, rarity, imageUrl}]
--   prices    [{productId, variant, marketPrice}]   marketPrice in dollars
--
-- Nothing is ever deleted: a Card TCGCSV drops stays in the Catalog, because
-- Traders may own it.
create function public.apply_catalog_set(
  card_set jsonb,
  cards jsonb,
  prices jsonb,
  sync_day date
)
  returns void
  language plpgsql
  set search_path = ''
as $$
declare
  set_id integer;
  last_good_as_of date;
  last_good_cards integer;
  incoming_cards integer := jsonb_array_length(apply_catalog_set.cards);
  priced jsonb;
begin
  select s.id, s.synced_as_of into set_id, last_good_as_of
    from public.card_sets s
    where s.tcgplayer_group_id = (card_set->>'groupId')::integer;

  if sync_day < last_good_as_of then
    raise exception 'set % was last synced as of %, after %',
      card_set->>'groupId', last_good_as_of, sync_day
      using errcode = '22023';
  end if;

  -- An upstream that suddenly reports under half the Cards we hold is broken,
  -- not authoritative.
  select count(*) into last_good_cards
    from public.cards c where c.card_set_id = set_id;
  if incoming_cards * 2 < last_good_cards then
    raise exception 'set % collapsed from % Cards to %',
      card_set->>'groupId', last_good_cards, incoming_cards
      using errcode = '22023';
  end if;

  -- A set with no Cards yet (announced but unreleased, or sealed product
  -- only) is not an error, and not worth a row.
  if incoming_cards = 0 then
    return;
  end if;

  insert into public.card_sets as s
      (tcgplayer_group_id, name, abbreviation, released_on, synced_as_of)
    values (
      (card_set->>'groupId')::integer,
      card_set->>'name',
      card_set->>'abbreviation',
      (card_set->>'releasedOn')::date,
      sync_day
    )
    on conflict (tcgplayer_group_id) do update set
      name = excluded.name,
      abbreviation = excluded.abbreviation,
      released_on = excluded.released_on,
      synced_as_of = excluded.synced_as_of
    returning s.id into set_id;

  insert into public.cards
      (card_set_id, tcgplayer_product_id, name, number, rarity, image_url)
    select set_id, c."productId", c.name, c.number, c.rarity, c."imageUrl"
      from jsonb_to_recordset(apply_catalog_set.cards) as c (
        "productId" integer, name text, number text, rarity text, "imageUrl" text
      )
    on conflict (tcgplayer_product_id) do update set
      card_set_id = excluded.card_set_id,
      name = excluded.name,
      number = excluded.number,
      rarity = excluded.rarity,
      image_url = excluded.image_url;

  -- Prices resolved to our Cards, in cents. A price row for a product that is
  -- not a Card (sealed product) joins to nothing and falls away here.
  select coalesce(jsonb_agg(jsonb_build_object(
      'card_id', c.id,
      'variant', p.variant,
      'market_price_cents', round(p."marketPrice" * 100)::integer
    )), '[]')
    into priced
    from jsonb_to_recordset(apply_catalog_set.prices) as p (
      "productId" integer, variant text, "marketPrice" numeric
    )
    join public.cards c on c.tcgplayer_product_id = p."productId";

  insert into public.card_variants (card_id, name)
    select i.card_id, i.variant from jsonb_to_recordset(priced) as i (card_id integer, variant text)
    on conflict (card_id, name) do nothing;

  -- Changed-only: a snapshot only where today's price differs from the one
  -- the Variant holds. A same-day re-run that brings a newer price replaces
  -- that day's snapshot rather than adding one.
  insert into public.price_snapshots (card_variant_id, as_of, market_price_cents)
    select v.id, sync_day, i.market_price_cents
      from jsonb_to_recordset(priced) as i (
        card_id integer, variant text, market_price_cents integer
      )
      join public.card_variants v
        on v.card_id = i.card_id and v.name = i.variant
      where i.market_price_cents is not null
        and i.market_price_cents is distinct from v.market_price_cents
    on conflict (card_variant_id, as_of) do update set
      market_price_cents = excluded.market_price_cents;

  -- A Variant TCGCSV stops pricing keeps its last Market Price and the day it
  -- was last confirmed: stale but working.
  update public.card_variants v
    set market_price_cents = i.market_price_cents,
        market_price_as_of = sync_day
    from jsonb_to_recordset(priced) as i (
      card_id integer, variant text, market_price_cents integer
    )
    where v.card_id = i.card_id
      and v.name = i.variant
      and i.market_price_cents is not null;
end;
$$;

-- The compaction posture of ADR-0003, second half: history older than 90
-- days keeps only the last snapshot of each ISO week per Variant. Reading
-- "latest row on or before a day" still works, at weekly resolution.
create function public.compact_price_snapshots(sync_day date)
  returns void
  language sql
  set search_path = ''
as $$
  delete from public.price_snapshots s
    where s.as_of < sync_day - 90
      and exists (
        select 1 from public.price_snapshots later
          where later.card_variant_id = s.card_variant_id
            and later.as_of > s.as_of
            and later.as_of < sync_day - 90
            and date_trunc('week', later.as_of) = date_trunc('week', s.as_of)
      );
$$;

-- The sync job is the Catalog's one writer, and it connects as service_role,
-- the server-side identity no client holds. Both functions run as their
-- caller, so that role needs the table rights too. deny_by_default took
-- execute from PUBLIC, so these grants are the whole list of who may write.
grant select, insert, update, delete
  on public.card_sets, public.cards, public.card_variants, public.price_snapshots
  to service_role;
grant execute on function public.apply_catalog_set(jsonb, jsonb, jsonb, date)
  to service_role;
grant execute on function public.compact_price_snapshots(date)
  to service_role;
