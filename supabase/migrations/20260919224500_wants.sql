-- Wants: the Cards a Trader is looking for, and the half of Matching that a
-- Listing is matched against (#19). A Want names a Card; the Variant and the
-- minimum Condition are optional narrowings, and a Want that sets neither is
-- satisfied by any Copy of that Card.
--
-- A Want is private to its owner. Nothing about it is public: Matching will
-- show a Trader only the pairing a Want produced, never the want-list it
-- came from.

-- A Variant is only ever a narrowing of the Want's own Card, so the two
-- columns travel as one foreign key below. That needs (id, card_id) to be a
-- key of card_variants; id alone already is, so this only gives the
-- reference something to point at and constrains nothing new.
alter table public.card_variants add constraint card_variants_id_card_id_key
  unique (id, card_id);

create table public.wants (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders (id) on delete cascade,
  card_id integer not null,
  -- Null means any Variant of the Card.
  card_variant_id integer,
  -- Null means any Condition. public.card_condition is declared by the
  -- Collection migration, worst to best, so this floor is an ordinary
  -- comparison - a Copy satisfies it when
  -- `copy.condition >= want.min_condition` - rather than a lookup table
  -- Matching (#19) would have to carry.
  min_condition public.card_condition,
  created_at timestamptz not null default now(),
  foreign key (card_id) references public.cards (id) on delete cascade,
  -- A Variant of some other Card cannot be stored at all.
  foreign key (card_variant_id, card_id)
    references public.card_variants (id, card_id) on delete cascade,
  -- The same Want twice is one Want. `nulls not distinct` is what makes that
  -- true of the un-narrowed ones too, which are the common case: without it
  -- two Wants naming only a Card would both be stored, and Matching would
  -- pair a Listing with each of them.
  unique nulls not distinct (trader_id, card_id, card_variant_id, min_condition)
);

-- Matching walks from a Listing's Card to the Wants for it (#19), so that is
-- the direction the index covers. The unique constraint above already
-- indexes the owner's own list.
create index wants_card_id_idx on public.wants (card_id);

-- No client role holds a privilege until granted below (deny_by_default), and
-- RLS filters whatever a grant lets through. Select is the only grant, so a
-- Want changes only through the two RPCs.
alter table public.wants enable row level security;

grant select on public.wants to authenticated;

create policy "A Trader can read their own Wants"
  on public.wants for select
  to authenticated
  using (trader_id = (select auth.uid()));

-- Adds a Want for the calling Trader. It takes no Trader id, so a Trader can
-- only ever add to their own want-list. Adding a Want they already hold
-- returns the one they hold: the screen's add button is the same button
-- whether or not the Want is new, and pressing it twice should not be an
-- error a Trader has to read.
create function public.add_want(
  card_id integer,
  card_variant_id integer default null,
  min_condition public.card_condition default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
-- The parameters are the names the client sends, so card_id and
-- card_variant_id are also the names of the columns they are stored in. The
-- `on conflict` target has to be bare column names, which PL/pgSQL would
-- otherwise refuse as ambiguous; this says a bare name there means the
-- column. Every reference to a parameter below is qualified with the
-- function's own name, which is what keeps that unambiguous in both
-- directions.
#variable_conflict use_column
declare
  caller uuid := auth.uid();
  want_id uuid;
begin
  if caller is null then
    raise exception 'add_want requires a signed-in Trader'
      using errcode = '42501';
  end if;
  if add_want.card_id is null then
    raise exception 'a Want must name a Card'
      using errcode = '23502';
  end if;

  insert into public.wants as w
      (trader_id, card_id, card_variant_id, min_condition)
    values (
      caller,
      add_want.card_id,
      add_want.card_variant_id,
      add_want.min_condition
    )
    on conflict (trader_id, card_id, card_variant_id, min_condition)
      -- A no-op update, so the row the Trader already holds comes back
      -- through `returning` the way a fresh insert does.
      do update set trader_id = w.trader_id
    returning w.id into want_id;

  return want_id;
end;
$$;

-- Removes one of the calling Trader's Wants. A want_id belonging to someone
-- else gets the same answer as one that exists nowhere, so a foreign Trader
-- cannot learn which ids are real by probing.
create function public.remove_want(want_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'remove_want requires a signed-in Trader'
      using errcode = '42501';
  end if;

  delete from public.wants
    where id = remove_want.want_id and trader_id = caller;
  if not found then
    raise exception 'no Want of yours has that id'
      using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function
  public.add_want(integer, integer, public.card_condition)
  to authenticated;
grant execute on function public.remove_want(uuid) to authenticated;
