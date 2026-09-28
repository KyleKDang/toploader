-- Blocking (#28): any Trader can block another, and from then on the two
-- are strangers to each other in both directions, whichever of them
-- blocked. Neither sees the other's Listings or Matches, neither can propose
-- to the other, and nothing on a Trade between them moves forward or gets
-- said.
--
-- What a block leaves alone is every way a Trade ends. A Trade already open
-- between the two can still be declined, cancelled, completed, or reported
-- a no-show, so nothing is left holding Listings in a Trade that can never
-- finish, and Reputation still counts what actually happened. Ending those
-- Trades for the Trader instead would put a cancel on someone's Reputation
-- for keeping themselves safe, or let a block dodge a no-show.

create table public.blocks (
  blocker_id uuid not null references public.traders (id) on delete cascade,
  blocked_id uuid not null references public.traders (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- The primary key looks a block up from the blocker's side; this is the
-- other.
create index blocks_blocked_id_idx on public.blocks (blocked_id);

-- A block is read by its two Traders and nobody else. The blocked Trader is
-- not notified, but hiding the row from them would hide nothing: the other
-- Trader's Listings vanish and every step toward them is refused, so the
-- block is plain to them the first time they look. What stays private is
-- who blocks whom among everyone else. Writes go through the RPC below
-- (ADR-0001).
--
-- Readable from both sides is also what lets City browse's policy ask about
-- a block as the reader, rather than through a function running as its
-- owner that any client could call.
alter table public.blocks enable row level security;

grant select on public.blocks to authenticated;

create policy "A Trader can read the blocks they are party to"
  on public.blocks for select
  to authenticated
  using ((select auth.uid()) in (blocker_id, blocked_id));

-- Whether either of two Traders has blocked the other, for the triggers
-- below, which ask about Traders other than the caller. It runs as
-- its owner so that it holds whoever is signed in, and no client role may
-- call it (deny_by_default): asked about any two Traders, it would say who
-- blocks whom.
create function public.blocked_between(a uuid, b uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
      or (blocker_id = b and blocked_id = a)
  )
$$;

-- Blocks another Trader as the caller. It takes no blocker id, so a Trader
-- can only ever block for themselves, and blocking someone already blocked
-- changes nothing.
create function public.block_trader(trader_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'blocking needs a signed-in Trader'
      using errcode = '42501';
  end if;

  if block_trader.trader_id = caller or not exists (
    select 1 from public.traders where traders.id = block_trader.trader_id
  ) then
    raise exception 'a Trader blocks another Trader'
      using errcode = '22023';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
    values (caller, block_trader.trader_id)
    on conflict do nothing;
end;
$$;

grant execute on function public.block_trader(uuid) to authenticated;

-- City browse, as before, less the Listings of anyone the reader is in a
-- block with, from either side. The subquery reads `blocks` under its own
-- policy, which shows the reader exactly the blocks they are party to.
drop policy "A Trader can read the live Listings of their City"
  on public.listings;

create policy "A Trader can read the live Listings of their City"
  on public.listings for select
  to authenticated
  using (
    status in ('active', 'in_trade')
    and (
      select traders.city_id from public.traders
      where traders.id = listings.trader_id
    ) = (
      select traders.city_id from public.traders
      where traders.id = (select auth.uid())
    )
    and not exists (
      select 1 from public.blocks
      where (blocks.blocker_id = (select auth.uid())
          and blocks.blocked_id = listings.trader_id)
        or (blocks.blocker_id = listings.trader_id
          and blocks.blocked_id = (select auth.uid()))
    )
  );

-- The two Traders of an open Trade read what is on the table, whatever else
-- keeps them apart. A block ends browse between them, but a Trade already
-- open between them can still end, and ending it means seeing what it holds.
-- Until now this came with browse, since both Traders of a Trade share a
-- City; stated here, it holds on its own, so a Trader who moves City
-- mid-Trade also keeps seeing the Trade they are still in.
--
-- Only while the Listing is still on offer: one its Trader has withdrawn
-- from under a proposal is theirs alone, as City browse already has it.
-- Which Trades count is not a second rule: the subquery reads `trades`
-- under its own policy, so it finds only the caller's.
create policy "A Trader can read the Listings of their open Trades"
  on public.listings for select
  to authenticated
  using (
    status in ('active', 'in_trade')
    and exists (
      select 1
        from public.trade_items
          join public.trades on trades.id = trade_items.trade_id
        where trade_items.listing_id = listings.id
          and trades.status in ('proposed', 'accepted', 'scheduled')
    )
  );

-- A block ends every pair between its two Traders, in both of the places
-- the rules of a pair live (#66): `match_pairs`, which records new pairs and
-- so decides who is alerted, and `matches`, which is what a Trader reads.
-- Both run as their owner, so they read `blocks` directly. They cannot call
-- `blocked_between` instead: a view lends its owner's rights to the tables
-- it reads, but a function it calls is still checked against the reader,
-- and no client role may call that one.
create or replace view public.match_pairs as
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
  where listing.status = 'active'
    and want.trader_id <> listing.trader_id
    and lister.city_id = wanter.city_id
    and (want.card_variant_id is null
      or want.card_variant_id = listing.card_variant_id)
    and (want.min_condition is null
      or listing.condition >= want.min_condition)
    and not exists (
      select 1 from public.blocks
      where (blocks.blocker_id = listing.trader_id
          and blocks.blocked_id = want.trader_id)
        or (blocks.blocker_id = want.trader_id
          and blocks.blocked_id = listing.trader_id)
    );

create or replace view public.matches as
  select
    event.listing_id,
    event.lister_id,
    event.wanter_id,
    event.created_at as matched_at
  from public.match_events event
  where (select auth.uid()) in (event.lister_id, event.wanter_id)
    -- Neither Trader has blocked the other. Asked of the event's own two
    -- keys, so it is a lookup per event like the check below.
    and not exists (
      select 1 from public.blocks
      where (blocks.blocker_id = event.lister_id
          and blocks.blocked_id = event.wanter_id)
        or (blocks.blocker_id = event.wanter_id
          and blocks.blocked_id = event.lister_id)
    )
    -- The pair still holds, by the rules of `match_pairs` (#66).
    and exists (
      select 1
      from public.listings listing
        join public.traders lister on lister.id = listing.trader_id
        join public.wants want on want.trader_id = event.wanter_id
        join public.traders wanter on wanter.id = want.trader_id
      where listing.id = event.listing_id
        and listing.status = 'active'
        and want.trader_id <> listing.trader_id
        and lister.city_id = wanter.city_id
        and want.card_id = (
          select variant.card_id from public.card_variants variant
          where variant.id = listing.card_variant_id
        )
        and (want.card_variant_id is null
          or want.card_variant_id = listing.card_variant_id)
        and (want.min_condition is null
          or listing.condition >= want.min_condition)
      offset 0
    );

-- What a block stops on a Trade, held on the rows themselves so that it
-- holds whichever RPC writes them, today's and any later one's:
--
--   a Trade opened                         create_trade
--   a proposed Trade changed at all        counter_trade (accept moves it on)
--   an accepted Trade changed at all       accept_trade, propose_meetup
--   a Trade becoming scheduled             confirm_meetup
--   a message                              send_message
--
-- Everything else a Trade does is an ending, or happens to a scheduled
-- Trade on its way to one: a Complete tap, the Meetup reminder. Those go
-- through.
create function public.enforce_block_on_trade()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if (tg_op = 'INSERT'
      or new.status in ('proposed', 'accepted')
      or (new.status = 'scheduled' and old.status <> 'scheduled'))
    and public.blocked_between(new.proposer_id, new.recipient_id) then
    raise exception 'one of this Trade''s Traders has blocked the other'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger enforce_block_on_trade
  before insert or update on public.trades
  for each row execute function public.enforce_block_on_trade();

create function public.enforce_block_on_message()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if exists (
    select 1 from public.trades
    where trades.id = new.trade_id
      and public.blocked_between(trades.proposer_id, trades.recipient_id)
  ) then
    raise exception 'one of this Trade''s Traders has blocked the other'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger enforce_block_on_message
  before insert on public.messages
  for each row execute function public.enforce_block_on_message();
