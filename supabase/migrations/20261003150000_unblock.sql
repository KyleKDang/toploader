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
-- The unblock records those pairs itself, and alerts both Traders: neither
-- has seen them, the Trader who unblocked included, so the rule that a
-- change alerts only the other side of it (ADR-0008, 2026-09-27) has no
-- side to drop here. A pair recorded before the block is already known to
-- both, so it comes back to `matches` without a second alert.

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

  delete from public.blocks
    where blocker_id = caller and blocked_id = unblock_trader.trader_id;

  if not found then
    return;
  end if;

  -- Asked once from each side, so that each lookup starts from one
  -- Trader's own Listings by index, as record_new_matches asks a move
  -- (20261003130000_match_pairs_on_city_move.sql). While the other Trader
  -- still holds a block, `match_pairs` holds no pair between them, so
  -- nothing is recorded until that block goes too.
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

  if listing_ids is null then
    return;
  end if;

  -- Both Traders, each in their own terms, with the copy and the links
  -- record_new_matches gives each side.
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
      cross join lateral (
        select
          wanter.id,
          format('%s listed %s (%s, %s), a card you want.',
            lister.display_name, card.name, variant.name, listing.condition),
          '/listings/' || pair.listing_id
        union all
        select
          lister.id,
          format('%s wants the %s you listed.', wanter.display_name, card.name),
          '/'
      ) as alerted (trader_id, body, url);
end;
$$;

grant execute on function public.unblock_trader(uuid) to authenticated;
