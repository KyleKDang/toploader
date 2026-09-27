-- Reading `matches` cost what every pair in the app cost, not what the
-- caller's own pairs cost (#66). Its check that a pair still holds asked
-- `match_pairs`, and `match_pairs` is `select distinct`: the planner cannot
-- push a per-row condition into a distinct, so it computed every pair in
-- the app, deduplicated them, and only then joined the caller's events. A
-- Trader with no Matches paid for everyone's.
--
-- Pointing the check at an undeduplicated form of `match_pairs` is not
-- enough. The planner is then free to order Listings against Wants itself,
-- and it estimates that join through the whole card catalog, so it expects
-- a handful of pairs app-wide where a City's Listings and Wants crowd onto
-- the same popular Cards. Every plan that enumerates pairs looks cheap to
-- it, and none is.
--
-- So the check is asked once per event, about that event alone. Every table
-- in it is reached by one of the event's keys: its Listing and both
-- Traders by primary key, the wanting Trader's Wants through the index that
-- leads with trader_id, and the Listing's Card through its Variant's key.
-- Whatever order the planner picks, each step is a lookup, so the work is
-- bounded by the caller's events however much the rest of the app holds.
--
-- The rules are those of `match_pairs`, restated for one pair, because the
-- triggers still need `match_pairs` to enumerate pairs. A change to what
-- makes a pair hold changes both.
--
-- The view still runs as its owner and filters to the caller, which is its
-- policy (the ADR-0001 amendment on #19); it returns what it returned.
create or replace view public.matches as
  select
    event.listing_id,
    event.lister_id,
    event.wanter_id,
    event.created_at as matched_at
  from public.match_events event
  where (select auth.uid()) in (event.lister_id, event.wanter_id)
    -- The pair still holds, by the rules of `match_pairs`: the Listing is
    -- still active, both Traders are in one City now, and at least one of
    -- the wanting Trader's Wants for this Card is satisfied by it.
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
        -- A scalar lookup rather than a join, so the planner never
        -- estimates Wants against the whole catalog through it.
        and want.card_id = (
          select variant.card_id from public.card_variants variant
          where variant.id = listing.card_variant_id
        )
        and (want.card_variant_id is null
          or want.card_variant_id = listing.card_variant_id)
        -- card_condition is declared worst to best, so this reads "at
        -- least this good".
        and (want.min_condition is null
          or listing.condition >= want.min_condition)
      -- A fence: `offset` keeps the planner from turning this check into a
      -- join it could run for every pair at once, so it runs per event.
      offset 0
    );

-- The warning above, where the next change to `match_pairs` will meet it:
-- its migration is already applied, so its own comment cannot carry it.
comment on view public.match_pairs is
  'Every pair that holds right now. The same rules are restated for one '
  'pair in the matches view (#66); a change to what makes a pair hold '
  'changes both.';
