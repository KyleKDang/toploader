-- Unblocking (#87): a Trader takes back a block they made. Everything a
-- block stops is read off the `blocks` row while it stands (City browse,
-- `match_pairs`, `matches`, and the Trade and message triggers of
-- 20260928120000_blocks.sql), so deleting the row gives all of it back at
-- once, and a block the other Trader holds still keeps them apart.
--
-- What deleting the row cannot give back is the alert. `match_pairs` left
-- out every pair between the two while the block stood, so a pair that
-- first held then was never recorded in `match_events` and never alerted,
-- and nothing records it later until one of its Listings or Wants changes.
-- The unblock records those pairs itself and alerts both Traders, since
-- neither has seen them (the ADR-0008 amendment of 2026-10-03). A pair
-- recorded before the block is already known to both, so it comes back to
-- `matches` without a second alert.

-- Queues one Match alert per recorded pair, to the Trader on the other side
-- of `changed_by`'s change, or to both Traders when no one's change made the
-- pair hold. Each Trader in their own terms: the wanting Trader is sent to
-- the Listing, which is what they want to see; the lister to their Matches,
-- where the pairing is. Every producer of a Match alert calls this, so the
-- copy lives in one place. No client role may call it (deny_by_default).
create function public.queue_match_alerts(
  listing_ids uuid[],
  wanter_ids uuid[],
  changed_by uuid
)
  returns void
  language sql
  security definer
  set search_path = ''
as $$
  insert into public.notifications (trader_id, kind, topic, title, body, url)
    select
      alerted.trader_id,
      'new_match',
      format('match:%s:%s', pair.listing_id, pair.wanter_id),
      'New match',
      alerted.body,
      alerted.url
    from unnest(listing_ids, wanter_ids) as pair (listing_id, wanter_id)
      join public.listings listing on listing.id = pair.listing_id
      join public.card_variants variant on variant.id = listing.card_variant_id
      join public.cards card on card.id = variant.card_id
      join public.traders lister on lister.id = listing.trader_id
      join public.traders wanter on wanter.id = pair.wanter_id
      -- The lister's change alerts the wanting Trader, and the wanting
      -- Trader's change alerts the lister.
      cross join lateral (
        select
          wanter.id,
          format('%s listed %s (%s, %s), a card you want.',
            lister.display_name, card.name, variant.name, listing.condition),
          '/listings/' || pair.listing_id
        where changed_by is null or lister.id = changed_by
        union all
        select
          lister.id,
          format('%s wants the %s you listed.', wanter.display_name, card.name),
          '/'
        where changed_by is null or wanter.id = changed_by
      ) as alerted (trader_id, body, url)
$$;

-- Records whichever pairs a change has just made hold, exactly as
-- 20261003130000_match_pairs_on_city_move.sql has it, and queues their
-- alerts through queue_match_alerts rather than writing them here.
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

-- Takes back the caller's own block on another Trader. It takes no blocker
-- id, so a Trader can only ever take back a block they made, and taking
-- back a block that is not there changes nothing.
create function public.unblock_trader(trader_id uuid)
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

  -- Both Traders' blocks on each other, locked in one order, so that two
  -- unblocks between the same Traders take turns. Run side by side, each
  -- would still see the other's block standing and record nothing, and the
  -- pairs would stay unrecorded with neither block left. Taking turns, the
  -- second reads the pairs after the first has committed.
  perform 1 from public.blocks
    where (blocker_id = caller and blocked_id = unblock_trader.trader_id)
      or (blocker_id = unblock_trader.trader_id and blocked_id = caller)
    order by blocker_id
    for update;

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

grant execute on function public.unblock_trader(uuid) to authenticated;
