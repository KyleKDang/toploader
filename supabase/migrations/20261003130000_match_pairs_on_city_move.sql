-- A Trader's move into a City looks up only their own pairs (#96).
--
-- `record_new_matches` found the pairs a move made hold with
-- `new.id in (pair.lister_id, pair.wanter_id)`. Those two columns come from
-- two different tables under match_pairs, so no index answers the `or`, and
-- the planner built every pair in the database before keeping the mover's:
-- the whole join of active Listings to the Wants for their Card, across
-- every City. So a Trader's onboarding cost grew with every Match anyone
-- had, not with their own, and a Trader with nothing listed or wanted yet
-- paid it in full. On a local stack of 7,400 Listings and 1,200 Wants, most
-- of them for one Card in one City, setting a Trader's City took 4 to 8 s,
-- against about half a second split as below.
--
-- Now the move asks twice, once as the lister and once as the wanting
-- Trader, and each lookup starts from that Trader's own Listings or Wants by
-- index. A pair's two Traders are never the same Trader, so no pair is
-- found by both. What is recorded and queued is unchanged.

-- Records whichever pairs a change has just made hold, and queues one alert
-- for each to the Trader on the other side of the change, exactly as
-- 20260927200000_match_alerts_other_side.sql describes it. Only the lookup
-- for a Trader's move into a City changes. Its triggers stand.
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
  if listing_ids is null then
    return null;
  end if;

  -- Each Trader in their own terms, as before: the wanting Trader is sent
  -- to the Listing, which is what they want to see; the lister to their
  -- Matches, where the pairing is.
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
        where lister.id = changed_by
        union all
        select
          lister.id,
          format('%s wants the %s you listed.', wanter.display_name, card.name),
          '/'
        where wanter.id = changed_by
      ) as alerted (trader_id, body, url);

  return null;
end;
$$;
