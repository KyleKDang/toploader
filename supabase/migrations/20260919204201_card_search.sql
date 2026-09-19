-- Card search: the autocomplete behind the search picker, the only way a
-- Trader enters a Card in v1. It searches every Card in the Catalog on the
-- server and returns the best few, so a client never pages through 20k rows
-- to filter them itself.

-- A trigram index answers "contains this text" without reading every row.
-- It covers the name and the collector number together, since a Trader may
-- type either, or both ("umbreon 215").
create extension if not exists pg_trgm with schema extensions;

create index cards_search_idx on public.cards
  using gin ((name || ' ' || number) extensions.gin_trgm_ops);

-- Every word of the search must appear in the Card's name or collector
-- number, in any order and any case. Names that start with the whole search
-- rank first, then the newest set, so "charizard" leads with Charizard
-- rather than Dark Charizard, and with this year's printing before 1999's.
--
-- A read, not a write: it runs as the calling Trader, so the Catalog's
-- select policies still decide what it can see.
--
-- The trigram index can only be used when the planner sees the pattern
-- itself, so the patterns are worked out first and the query is planned
-- afresh with them on every call (force_custom_plan). A plan cached for
-- "any pattern" reads all 20k rows instead.
create function public.search_cards(query text)
  returns setof public.cards
  language plpgsql
  stable
  set search_path = ''
  set plan_cache_mode = force_custom_plan
as $$
declare
  -- LIKE's own wildcards and escape, taken literally: "100%" is a percent
  -- sign a Trader typed, not "anything after 100". Runs of whitespace
  -- collapse to one space, as they would in a name.
  search text := replace(replace(replace(
    regexp_replace(btrim(query), '\s+', ' ', 'g'),
    '\', '\\'), '%', '\%'), '_', '\_');
  patterns text[];
  narrowest text;
begin
  if search = '' then
    return;
  end if;

  -- The longest word narrows the most, and a single pattern is what the
  -- index can answer; the other words filter the few rows it finds.
  select array_agg('%' || word || '%' order by length(word) desc)
    into patterns
    from regexp_split_to_table(search, ' ') as word;
  narrowest := patterns[1];

  return query
    select c.*
      from public.cards c
      join public.card_sets s on s.id = c.card_set_id
      where (c.name || ' ' || c.number) ilike narrowest
        and (c.name || ' ' || c.number) ilike all (patterns)
      order by
        c.name ilike search || '%' desc,
        s.released_on desc nulls last,
        c.name,
        c.number
      limit 20;
end;
$$;

grant execute on function public.search_cards(text) to authenticated;
