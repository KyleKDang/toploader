-- The Founders, named on #36 and recorded in ADR-0007: Tate Nguyen, who
-- reviews verification requests, and Kyle Dang, who holds the same rights.
-- Both, because a Founder cannot review their own request: a sole Founder
-- could never become a Verified Trader.
--
-- The ids are their Trader accounts on the hosted app. They are selected
-- from `traders` rather than inserted outright, so that on a stack where
-- those accounts do not exist - every local stack, and CI's - this seeds
-- nobody instead of failing on the foreign key. The suites seed a Founder
-- of their own (tests/db/arrange.ts) and never depend on these.
--
-- On the hosted database it is both or nothing. A migration runs once, so
-- one that seeded a single Founder and called itself applied would leave
-- the deadlock above in place with nothing to say so. The hosted database
-- is known by the notifier's address, a Vault secret set only there
-- (docs/operations.md); a stack without it is a local one.
do $$
declare
  seeded integer;
  hosted boolean := exists (
    select 1 from vault.secrets where name = 'notifier_url'
  );
begin
  insert into public.founders (trader_id)
    select traders.id
      from public.traders
      where traders.id in (
        'cd5f7b45-38e7-408d-a61d-ba3e903d2b6d', -- Tate Nguyen
        'cbaaf75f-a123-45cf-8f36-b703cf67fcb6'  -- Kyle Dang
      )
    on conflict (trader_id) do nothing;
  get diagnostics seeded = row_count;

  if hosted and seeded <> 2 then
    raise exception 'seeded % of 2 Founders: an id above is not a Trader account', seeded;
  end if;
  raise notice 'seeded % of 2 Founders', seeded;
end;
$$;
