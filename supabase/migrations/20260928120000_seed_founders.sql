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
do $$
declare
  seeded integer;
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

  -- Read in the log of the job that applies this to the hosted database:
  -- anything but 2 there means an id above is not an account.
  raise notice 'seeded % of 2 Founders', seeded;
end;
$$;
