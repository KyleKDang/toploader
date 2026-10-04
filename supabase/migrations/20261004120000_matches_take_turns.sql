-- Writes that can make the same Match take turns (#107).
--
-- A pair holds once both of its halves are committed: an active Listing and
-- a Want for its Card, their two Traders in one City, no block between
-- them. Every write that can complete a pair looks for the pairs it made
-- hold by reading `match_pairs` inside its own transaction, and a
-- transaction does not see what another has written and not yet committed.
-- So when the two writes that complete a pair overlapped - a Listing and a
-- Want for it arriving together, an unblock against a Listing, a move into
-- a City against a Listing there - each looked before the other had
-- committed, neither found the pair, and it stood with no `match_events`
-- row: never alerted, and absent from `matches` for both Traders until some
-- later change to one of its halves happened to record it.
--
-- Now each of those writes first takes a lock, and holds it until its
-- transaction ends. Of two overlapping writes that could complete the same
-- pair, the second waits for the first to commit and only then looks, so
-- it sees the first one's half and records the pair. The unique key on
-- `match_events` already keeps a pair from being recorded twice.
--
-- A Listing or a Want can only complete pairs for its own Card, so it
-- takes its turn among the writes for that Card in its City, and Listings
-- and Wants for different Cards do not wait on each other. A move or an
-- unblock can complete pairs for any Card, so it takes the whole City's
-- turn: it waits for every Listing and Want in flight there, and they wait
-- for it.
--
-- What it costs: a turn lasts from the write's last step to its commit,
-- which is the pair lookup and the queueing of its alerts. On a local
-- stack where 1,200 Traders in one City want one Card, a Listing of that
-- Card makes 1,000 Matches and takes 2 s, nearly all of it recording and
-- alerting them, which it took before this too. A lock on the whole City
-- for every write would have made every Listing and Want there wait those
-- 2 s; by Card, only another write for that same Card does, and that one
-- has to see this one's pairs anyway. Different Cities never wait on each
-- other. A periodic sweep for missed pairs was the alternative and is not
-- needed at that cost: it would leave a Match unseen until it ran, and be
-- a second place the rules of who is alerted have to be kept.

-- Takes the caller's turn among the writes that can make a Match in the
-- Cities the given Traders are in, plus any Cities named outright; the turn
-- lasts until the transaction ends. Given a Card, it is a turn among the
-- writes for that Card, which any number of Cards can hold in a City at
-- once; given none, it is the whole City's, held alone. No client role may
-- call it (deny_by_default).
--
-- A Trader with no City yet can already hold Wants, and their first move
-- into a City is what makes those pair. Such a Trader takes a turn of
-- their own, under their own id where a City's would be, so that the Want
-- and the move still meet on a lock while no two Traders without a City
-- wait on each other.
--
-- A Trader may be moving while this waits, so once it holds the locks it
-- looks at where the Traders are again, and takes the turn for any City
-- they have since arrived in. A move takes the turn for the City it leaves
-- as well as the one it enters (see record_new_matches), which is what
-- makes a write that still saw the Trader in the old City wait for it.
--
-- Within one look the locks are taken in a fixed order, so two writes that
-- need the same Cities cannot each hold one the other is waiting for. A
-- second look that finds a Trader moved takes the new City's lock while
-- holding the old one's, out of that order; it takes a Trader moving twice
-- against two other writes to cross those over, and Postgres would end one
-- of them with a deadlock error rather than leave a Match unrecorded.
create function public.take_matching_turn(
  trader_ids uuid[],
  city_ids uuid[],
  card_id integer default null
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  turns uuid[];
  taken uuid[] := '{}';
  turn uuid;
  city_turn bigint;
begin
  loop
    -- Read afresh on every pass: each statement here sees what has
    -- committed by the time it starts.
    select coalesce(array_agg(distinct city.turn order by city.turn), '{}')
      into turns
      from (
        select coalesce(traders.city_id, traders.id)
          from public.traders
          where traders.id = any (trader_ids)
        union all
        select unnest(city_ids)
      ) as city (turn);

    exit when turns <@ taken;

    foreach turn in array turns loop
      city_turn := hashtextextended('matching in city ' || turn, 0);
      if card_id is null then
        perform pg_advisory_xact_lock(city_turn);
      else
        perform pg_advisory_xact_lock_shared(city_turn);
        perform pg_advisory_xact_lock(
          hashtextextended(
            format('matching in city %s for card %s', turn, card_id), 0
          )
        );
      end if;
    end loop;
    taken := taken || turns;
  end loop;
end;
$$;

-- Records whichever pairs a change has just made hold and queues their
-- alerts, exactly as 20261003170000_unblock.sql has it, after taking its
-- turn in the City. Its triggers stand.
create or replace function public.record_new_matches()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  -- The Trader whose Listing, Want, or City this is.
  changed_by uuid;
  -- The pairs this change made hold for the first time.
  listing_ids uuid[];
  wanter_ids uuid[];
begin
  if tg_table_name = 'listings' then
    changed_by := new.trader_id;
    perform public.take_matching_turn(
      array[new.trader_id],
      '{}',
      (select card_id from public.card_variants
        where id = new.card_variant_id)
    );
    with recorded as (
      insert into public.match_events (listing_id, lister_id, wanter_id)
        select pair.listing_id, pair.lister_id, pair.wanter_id
          from public.match_pairs pair
          where pair.listing_id = new.id
        on conflict (listing_id, wanter_id) do nothing
        returning listing_id, wanter_id
    )
    select array_agg(listing_id), array_agg(wanter_id)
      into listing_ids, wanter_ids from recorded;
  elsif tg_table_name = 'wants' then
    changed_by := new.trader_id;
    perform public.take_matching_turn(
      array[new.trader_id], '{}', new.card_id
    );
    with recorded as (
      insert into public.match_events (listing_id, lister_id, wanter_id)
        select pair.listing_id, pair.lister_id, pair.wanter_id
          from public.match_pairs pair
          where pair.wanter_id = new.trader_id and pair.card_id = new.card_id
        on conflict (listing_id, wanter_id) do nothing
        returning listing_id, wanter_id
    )
    select array_agg(listing_id), array_agg(wanter_id)
      into listing_ids, wanter_ids from recorded;
  elsif tg_table_name = 'traders' then
    changed_by := new.id;
    -- Leaving every City, as a deleted account does, makes no pair hold,
    -- so it takes no turn and waits on no one.
    if new.city_id is null then
      return null;
    end if;
    -- The City left as well as the one entered: the mover's own Listing or
    -- Want, written while the move was not yet committed, took its turn in
    -- the old City, or under the mover's own id if they had none.
    perform public.take_matching_turn(
      array[new.id],
      array[coalesce(old.city_id, new.id)]
    );
    with recorded as (
      insert into public.match_events (listing_id, lister_id, wanter_id)
        select pair.listing_id, pair.lister_id, pair.wanter_id
          from public.match_pairs pair
          where pair.lister_id = new.id
        union all
        select pair.listing_id, pair.lister_id, pair.wanter_id
          from public.match_pairs pair
          where pair.wanter_id = new.id
        on conflict (listing_id, wanter_id) do nothing
        returning listing_id, wanter_id
    )
    select array_agg(listing_id), array_agg(wanter_id)
      into listing_ids, wanter_ids from recorded;
  end if;

  -- Nothing new held, so nothing to queue, and no insert to wake the
  -- notifier for.
  if listing_ids is not null then
    perform public.queue_match_alerts(listing_ids, wanter_ids, changed_by);
  end if;

  return null;
end;
$$;

-- Takes back the caller's own block on another Trader, exactly as
-- 20261003170000_unblock.sql has it, except for how it takes turns. It
-- locked the two Traders' blocks on each other so that two unblocks between
-- them could not each miss the pairs; it now takes the whole turn of both
-- Traders' Cities, which makes it wait for those and for a Listing, a Want,
-- or a move by either Trader as well.
create or replace function public.unblock_trader(trader_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  -- The pairs between the two that the unblock made hold for the first
  -- time.
  listing_ids uuid[];
  wanter_ids uuid[];
begin
  if caller is null then
    raise exception 'unblocking needs a signed-in Trader'
      using errcode = '42501';
  end if;

  if unblock_trader.trader_id = caller or not exists (
    select 1 from public.traders where traders.id = unblock_trader.trader_id
  ) then
    raise exception 'a Trader unblocks another Trader'
      using errcode = '22023';
  end if;

  -- Before looking for the pairs, so that the look comes after whatever
  -- write went before it has committed, and before touching the block, so
  -- that it never waits for a turn while holding a row another write
  -- needs. Two unblocks between the same Traders take the same turns: run
  -- side by side, each would still see the other's block standing and
  -- record nothing.
  perform public.take_matching_turn(
    array[caller, unblock_trader.trader_id],
    '{}'
  );

  delete from public.blocks
    where blocker_id = caller and blocked_id = unblock_trader.trader_id;

  if not found then
    return;
  end if;

  -- Asked once from each side, so that each lookup starts from one
  -- Trader's own Listings by index, as record_new_matches asks a move.
  -- While the other Trader still holds a block, `match_pairs` holds no pair
  -- between them, so nothing is recorded until that block goes too.
  with recorded as (
    insert into public.match_events (listing_id, lister_id, wanter_id)
      select pair.listing_id, pair.lister_id, pair.wanter_id
        from public.match_pairs pair
        where pair.lister_id = caller
          and pair.wanter_id = unblock_trader.trader_id
      union all
      select pair.listing_id, pair.lister_id, pair.wanter_id
        from public.match_pairs pair
        where pair.lister_id = unblock_trader.trader_id
          and pair.wanter_id = caller
      on conflict (listing_id, wanter_id) do nothing
      returning listing_id, wanter_id
  )
  select array_agg(listing_id), array_agg(wanter_id)
    into listing_ids, wanter_ids from recorded;

  -- No one's change made these pairs hold, so both Traders are alerted.
  if listing_ids is not null then
    perform public.queue_match_alerts(listing_ids, wanter_ids, null);
  end if;
end;
$$;

-- The Trade's Listings, locked and moved exactly as
-- 20260927210000_trade_endings.sql has it. Making them active again can
-- make Matches, one Listing at a time and each for its own Card, so a Trade
-- of several Cards would take their turns in whatever order its rows were
-- stored, and two Trades ending together could each hold a Card's turn the
-- other was waiting for. So the turns are taken here first, in one order.
create or replace function public.move_trade_listings(
  trade public.trades,
  status public.listing_status
)
  returns void
  language plpgsql
  set search_path = ''
as $$
declare
  listing record;
begin
  if trade.status = 'proposed' then
    return;
  end if;

  perform 1 from public.listings
    where listings.id in (
      select trade_items.listing_id from public.trade_items
      where trade_items.trade_id = trade.id
    )
    order by listings.id
    for update;

  if move_trade_listings.status = 'active' then
    for listing in
      select listings.trader_id, card_variants.card_id
        from public.trade_items
          join public.listings on listings.id = trade_items.listing_id
          join public.card_variants
            on card_variants.id = listings.card_variant_id
          join public.traders on traders.id = listings.trader_id
        where trade_items.trade_id = trade.id
        order by coalesce(traders.city_id, traders.id), card_variants.card_id
    loop
      perform public.take_matching_turn(
        array[listing.trader_id], '{}', listing.card_id
      );
    end loop;
  end if;

  update public.listings
    set status = move_trade_listings.status
    where listings.id in (
      select trade_items.listing_id from public.trade_items
      where trade_items.trade_id = trade.id
    );
end;
$$;
