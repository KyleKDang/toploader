-- A Safe Spot is a curated public meeting location in a City's directory,
-- where a Meetup takes place. Safe Spots are reference data, written only by
-- migrations: production's are seeded by a later migration (#30), and local
-- and CI stacks get made-up ones from supabase/seed.sql.

create type public.safe_spot_kind as enum (
  -- A police station's designated exchange zone.
  'police_station',
  -- An equivalent site with lighting and video monitoring.
  'monitored_site'
);

create table public.safe_spots (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities (id),
  name text not null check (name = btrim(name) and name <> ''),
  address text not null check (address = btrim(address) and address <> ''),
  kind public.safe_spot_kind not null,
  -- Anything a Trader should know before they go, such as where on the lot
  -- the exchange zone is.
  notes text check (notes = btrim(notes) and notes <> ''),
  created_at timestamptz not null default now(),
  unique (city_id, name)
);

-- No client role holds a privilege until granted below (deny_by_default), and
-- RLS filters whatever a grant lets through. Policies are additive grants.
alter table public.safe_spots enable row level security;

grant select on public.safe_spots to authenticated;

-- A Trader meets only within their own City, so that is the directory they
-- see. A Trader who has not picked a City yet sees none.
create policy "A Trader can read their own City's Safe Spots"
  on public.safe_spots for select
  to authenticated
  using (
    city_id = (
      select traders.city_id from public.traders
      where traders.id = (select auth.uid())
    )
  );
