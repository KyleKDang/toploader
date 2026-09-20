-- A Collection is a Trader's private inventory of the Copies they own. One
-- row is one Copy in one Variant and Condition, with how many of them the
-- Trader holds, so owning three Near Mint Holofoils is a quantity rather
-- than three rows.
--
-- Visible only to its owner: the select policy is the whole read rule, and
-- there is no grant to write, so every change goes through the named RPCs
-- below (ADR-0001).

-- The raw-card scale of CONTEXT.md, which writes it as the abbreviations
-- collectors write. Every screen spells them out in words; the abbreviation
-- is what the database holds.
--
-- Declared worst to best, because an enum compares in declaration order and
-- the comparison this ordering exists for is a Want's minimum Condition:
-- `copy.condition >= want.min_condition` then reads as "at least this good"
-- (#18, #19). Settled with the #17 and #18 sessions, which assume the same
-- direction; the screens order the scale best first regardless, since that
-- is how a Trader picks.
create type public.card_condition as enum (
  -- Damaged
  'DMG',
  -- Heavily Played
  'HP',
  -- Moderately Played
  'MP',
  -- Lightly Played
  'LP',
  -- Near Mint
  'NM'
);

create table public.collection_entries (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders (id) on delete cascade,
  card_variant_id integer not null references public.card_variants (id) on delete cascade,
  condition public.card_condition not null,
  -- A Copy that is owned zero times is not an entry; removing it is
  -- remove_from_collection. The ceiling is not a rule about collecting: it
  -- keeps a typo, or a client that skips the app, from swamping the
  -- total-value line with a number no Trader could own.
  quantity integer not null check (quantity between 1 and 9999),
  created_at timestamptz not null default now(),
  -- The same Card, Variant, and Condition is one entry however many times a
  -- Trader adds it, which is what makes adding two more a quantity change.
  -- Named, because the RPCs below name it: an `on conflict` column list
  -- cannot be spelled inside a function whose parameters carry the same
  -- names as the columns.
  constraint collection_entries_copy_key
    unique (trader_id, card_variant_id, condition)
);

-- Every read of a Collection is "this Trader's", and the Collection screen
-- reads it newest first.
create index collection_entries_trader_idx
  on public.collection_entries (trader_id, created_at desc);

-- No client role holds a privilege until granted below (deny_by_default), and
-- RLS filters whatever a grant lets through. Select is the only grant, so a
-- client can read its own Collection and write none.
alter table public.collection_entries enable row level security;

grant select on public.collection_entries to authenticated;

create policy "A Trader can read their own Collection"
  on public.collection_entries for select
  to authenticated
  using (trader_id = (select auth.uid()));

-- Adds Copies to the calling Trader's Collection, and returns the entry they
-- landed in. It takes no Trader id, so a Trader can only ever add to their
-- own Collection. Adding a Card, Variant, and Condition already held adds to
-- that entry's quantity, because a Trader who adds two more means they now
-- own two more.
create function public.add_to_collection(
  card_variant_id integer,
  condition public.card_condition,
  quantity integer
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  entry_id uuid;
begin
  if caller is null then
    raise exception 'add_to_collection requires a signed-in Trader'
      using errcode = '42501';
  end if;
  if add_to_collection.quantity < 1 then
    raise exception 'a Trader adds at least one Copy'
      using errcode = '22023';
  end if;

  insert into public.collection_entries as e
      (trader_id, card_variant_id, condition, quantity)
    values (
      caller,
      add_to_collection.card_variant_id,
      add_to_collection.condition,
      add_to_collection.quantity
    )
    on conflict on constraint collection_entries_copy_key do update
      set quantity = e.quantity + excluded.quantity
    returning e.id into entry_id;

  return entry_id;
end;
$$;

grant execute
  on function public.add_to_collection(integer, public.card_condition, integer)
  to authenticated;

-- Sets how many Copies an entry holds, which is how a Trader corrects a
-- count. It takes no Trader id, and finds the entry only within the caller's
-- own Collection, so another Trader's entry is not there to be found.
-- Emptying an entry is remove_from_collection, not a quantity of zero.
create function public.set_collection_quantity(
  entry_id uuid,
  quantity integer
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'set_collection_quantity requires a signed-in Trader'
      using errcode = '42501';
  end if;
  if set_collection_quantity.quantity < 1 then
    raise exception 'an entry holds at least one Copy; remove it instead'
      using errcode = '22023';
  end if;

  update public.collection_entries e
    set quantity = set_collection_quantity.quantity
    where e.id = set_collection_quantity.entry_id
      and e.trader_id = caller;
  if not found then
    raise exception 'no entry in your Collection has that id'
      using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.set_collection_quantity(uuid, integer)
  to authenticated;

-- Takes an entry out of the calling Trader's Collection. Scoped to the
-- caller the same way, so a foreign entry is never found and never deleted.
create function public.remove_from_collection(entry_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'remove_from_collection requires a signed-in Trader'
      using errcode = '42501';
  end if;

  delete from public.collection_entries e
    where e.id = remove_from_collection.entry_id
      and e.trader_id = caller;
  if not found then
    raise exception 'no entry in your Collection has that id'
      using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.remove_from_collection(uuid) to authenticated;

-- The one total-value line a Collection shows: what the Copies are worth at
-- their Variants' Market Prices, how many Copies that is, and how many of
-- them the Catalog has no price for - so the line can say so rather than
-- quietly valuing an unpriced Copy at nothing.
--
-- security_invoker, so the reader's own policies decide the rows exactly as
-- they would on the table: a Trader groups their own entries and nobody
-- else's, and a Trader with an empty Collection has no row at all.
create view public.collection_value
  with (security_invoker = true)
as
  select
    e.trader_id,
    sum(e.quantity)::integer as copy_count,
    -- sum skips a Variant with no price; coalesce covers a Collection where
    -- every Variant is one.
    coalesce(sum(e.quantity * v.market_price_cents), 0)::bigint as total_cents,
    coalesce(
      sum(e.quantity) filter (where v.market_price_cents is null), 0
    )::integer as unpriced_copy_count
  from public.collection_entries e
    join public.card_variants v on v.id = e.card_variant_id
  group by e.trader_id;

grant select on public.collection_value to authenticated;
