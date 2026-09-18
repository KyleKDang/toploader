-- A City is the metro area a Trader trades in: the unit of launch, matching
-- scope, and liquidity. Cities are reference data, written only by migrations.

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name = btrim(name) and name <> ''),
  created_at timestamptz not null default now()
);

-- No client role holds a privilege until granted below (deny_by_default), and
-- RLS filters whatever a grant lets through. Policies are additive grants.
alter table public.cities enable row level security;

grant select on public.cities to authenticated;

create policy "Any signed-in Trader can read Cities"
  on public.cities for select
  to authenticated
  using (true);

-- The launch City, chosen in ticket #11. Seeded here rather than in seed.sql,
-- because seed.sql runs only locally and production needs it too.
insert into public.cities (name) values ('Orange County');
