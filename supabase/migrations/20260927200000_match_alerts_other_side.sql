-- A new Match alerts only the Trader on the other side of the change that
-- made it (#72, the ADR-0008 amendment of 2026-09-27). A Listing going
-- active alerts the Traders who want it, a Want added alerts the Traders
-- whose Listings satisfy it, and a Trader changing City alerts the Traders
-- they now match; the Trader whose Listing, Want, or move it was is not told.
--
-- The first producer was a trigger on `match_events` that wrote a row for
-- both Traders of every pair. A `match_events` row does not say which side
-- made the pair hold, and only `record_new_matches` knows that, so the
-- alerts are queued there now, and the trigger on `match_events` goes.
--
-- Queued there, they are also one statement per change rather than one per
-- pair, so a change that makes many pairs looks them up in one pass and
-- wakes the notifier once.

drop trigger queue_match_notifications on public.match_events;
drop function public.queue_match_notifications();

-- Records whichever pairs a change has just made hold, as before, and
-- queues one alert for each to the Trader on the other side of the change.
--
-- The side is decided by whose row changed, not by who is signed in: a
-- Listing a cancelled Trade puts back to active is its lister's row, so it
-- alerts the Traders who want it, whoever cancelled. A pair's two Traders
-- are never the same Trader, so exactly one of them is the other side.
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
          where new.id in (pair.lister_id, pair.wanter_id)
        on conflict (listing_id, wanter_id) do nothing
        returning listing_id, wanter_id
    )
    select array_agg(listing_id), array_agg(wanter_id)
      into listing_ids, wanter_ids from recorded;
  end if;

  -- Nothing new held, so nothing to queue, and no insert to wake the
  -- notifier for.
  if listing_ids is null then
    return null;
  end if;

  -- Each Trader in their own terms, as before: the wanting Trader is sent
  -- to the Listing, which is what they want to see; the lister to their
  -- Matches, where the pairing is.
  insert into public.notifications (trader_id, kind, topic, title, body, url)
    select
      case when side.to_wanter then wanter.id else lister.id end,
      'new_match',
      format('match:%s:%s', pair.listing_id, pair.wanter_id),
      'New match',
      case when side.to_wanter
        then format('%s listed %s (%s, %s), a card you want.',
          lister.display_name, card.name, variant.name, listing.condition)
        else format('%s wants the %s you listed.',
          wanter.display_name, card.name)
      end,
      case when side.to_wanter then '/listings/' || pair.listing_id else '/' end
    from unnest(listing_ids, wanter_ids) as pair (listing_id, wanter_id)
      join public.listings listing on listing.id = pair.listing_id
      join public.card_variants variant on variant.id = listing.card_variant_id
      join public.cards card on card.id = variant.card_id
      join public.traders lister on lister.id = listing.trader_id
      join public.traders wanter on wanter.id = pair.wanter_id
      -- The lister's change alerts the wanting Trader, and the wanting
      -- Trader's change alerts the lister.
      cross join lateral (select lister.id = changed_by as to_wanter) side;

  return null;
end;
$$;
