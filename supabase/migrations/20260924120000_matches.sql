-- Matching: one Trader's active Listing satisfying another Trader's Want,
-- within one City. Three pieces:
--
--   match_pairs   every pair that holds right now; internal, no client reads it
--   match_events  the first time each pair held, recorded once and kept
--   matches       what a Trader reads: their own pairs that still hold
--
-- A Match is a Listing and a wanting Trader, not a Listing and a Want. A
-- Trader may hold overlapping Wants for one Card - any Copy, and a Holofoil
-- NM one - and a Listing satisfying both is still one thing to trade for,
-- one row on their screen, and one notification (#20). The Wants migration
-- left that collapse here.

-- Every pair that holds right now, computed rather than stored, so a
-- withdrawn Listing, a removed Want, or a Trader who moved away stops
-- matching the moment it happens, with nothing to keep in step.
--
-- It runs as its owner, not its reader: pairing needs every Trader's Wants,
-- and a Want is private to its owner. So no client role is granted it
-- (deny_by_default); Traders read `matches` below, which says whose pairs
-- they may see.
create view public.match_pairs as
  select distinct
    listing.id as listing_id,
    listing.trader_id as lister_id,
    want.trader_id as wanter_id,
    variant.card_id
  from public.listings listing
    join public.card_variants variant on variant.id = listing.card_variant_id
    join public.wants want on want.card_id = variant.card_id
    join public.traders lister on lister.id = listing.trader_id
    join public.traders wanter on wanter.id = want.trader_id
  -- Only an active Listing is on offer. One committed to a Trade is spoken
  -- for, and a traded or withdrawn one is gone.
  where listing.status = 'active'
    and want.trader_id <> listing.trader_id
    -- Both Traders' City as it is now, read from `traders` as City browse
    -- reads it, so a Trader who moves takes their Matches with them.
    and lister.city_id = wanter.city_id
    and (want.card_variant_id is null
      or want.card_variant_id = listing.card_variant_id)
    -- card_condition is declared worst to best, so this reads "at least
    -- this good".
    and (want.min_condition is null
      or listing.condition >= want.min_condition);

-- The first time each pair held. A row is written once and never removed
-- while its Listing and Traders exist, so a pair that lapses and holds again
-- - a cancelled Trade putting the Listing back, a Want removed and re-added
-- - is the same Match, and its notification (#20) is not sent twice.
--
-- lister_id is the Listing's own Trader, copied here so that who may read a
-- row is a question about the row alone. A Listing never changes hands, so
-- the copy cannot disagree with it.
create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  lister_id uuid not null references public.traders (id) on delete cascade,
  wanter_id uuid not null references public.traders (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (listing_id, wanter_id)
);

-- The unique constraint indexes the Listing side; this is the wanting side.
create index match_events_wanter_id_idx on public.match_events (wanter_id);
create index match_events_lister_id_idx on public.match_events (lister_id);

-- No client role reads or writes this table. An event outlives the pair it
-- records, so a Trader reading it would learn things `matches` deliberately
-- stops telling them: that a Trader whose Want is gone once wanted this
-- Card. A Trader reads their Matches through `matches` below; the one reader
-- here is the notifier (#20), which runs as service_role, the server-side
-- identity no client holds. Writes come only from the trigger below.
alter table public.match_events enable row level security;

grant select on public.match_events to service_role;

-- Records whichever pairs a change has just made hold, and leaves the pairs
-- already recorded alone: `on conflict do nothing` is what makes evaluating
-- a pair twice harmless, including two transactions racing to record it.
--
-- One function behind every change that can make a pair hold, each asking
-- only about the pairs that change could have touched:
--
--   a Listing going active    its own pairs
--   a Want added              its Trader's pairs for its Card
--   a Trader's City changing  every pair they are on, from either side
--
-- Nothing else can: a Listing's Card, Variant and Condition are fixed once
-- it is created, and a Want is never edited, only added and removed.
--
-- security definer so that it holds whoever makes the change. The RPCs that
-- write these tables today already run as their owner, but pairing reads
-- every Trader's Wants, and a trigger that only worked under a writer with
-- that power would fail the first time a change came from anywhere else.
create function public.record_new_matches()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_table_name = 'listings' then
    insert into public.match_events (listing_id, lister_id, wanter_id)
      select pair.listing_id, pair.lister_id, pair.wanter_id
        from public.match_pairs pair
        where pair.listing_id = new.id
      on conflict (listing_id, wanter_id) do nothing;
  elsif tg_table_name = 'wants' then
    insert into public.match_events (listing_id, lister_id, wanter_id)
      select pair.listing_id, pair.lister_id, pair.wanter_id
        from public.match_pairs pair
        where pair.wanter_id = new.trader_id and pair.card_id = new.card_id
      on conflict (listing_id, wanter_id) do nothing;
  elsif tg_table_name = 'traders' then
    insert into public.match_events (listing_id, lister_id, wanter_id)
      select pair.listing_id, pair.lister_id, pair.wanter_id
        from public.match_pairs pair
        where new.id in (pair.lister_id, pair.wanter_id)
      on conflict (listing_id, wanter_id) do nothing;
  end if;
  return null;
end;
$$;

create trigger record_new_matches
  after insert or update of status on public.listings
  for each row
  when (new.status = 'active')
  execute function public.record_new_matches();

create trigger record_new_matches
  after insert on public.wants
  for each row execute function public.record_new_matches();

create trigger record_new_matches
  after update of city_id on public.traders
  for each row
  when (new.city_id is distinct from old.city_id)
  execute function public.record_new_matches();

-- The pairs that held before this migration, which no trigger saw happen.
insert into public.match_events (listing_id, lister_id, wanter_id)
  select listing_id, lister_id, wanter_id from public.match_pairs
  on conflict (listing_id, wanter_id) do nothing;

-- The Matches view: the caller's own pairs that hold right now, with when
-- each first did. Every current pair has its event, because every change
-- that makes one hold records it, so reading from the events loses nothing;
-- and it means listing_id, lister_id and wanter_id are the event's own
-- foreign keys, which is what lets a client embed the Listing and both
-- Traders beside each row.
--
-- It runs as its owner for the reason match_pairs does, so the filter on
-- the caller is this view's policy: a Trader sees a pair only from one of
-- its two sides, and the only thing the lister learns about the other
-- Trader's want-list is that it holds this one Card, for as long as it does.
-- This is the one read that is not RLS-guarded, recorded as an amendment to
-- ADR-0001 (#19).
create view public.matches as
  select
    event.listing_id,
    event.lister_id,
    event.wanter_id,
    event.created_at as matched_at
  from public.match_events event
  where (select auth.uid()) in (event.lister_id, event.wanter_id)
    and exists (
      select 1 from public.match_pairs pair
      where pair.listing_id = event.listing_id
        and pair.wanter_id = event.wanter_id
    );

grant select on public.matches to authenticated;
