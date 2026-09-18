-- A Trader is a person with an account. RLS scopes rows, not columns, so the
-- profile is split by audience:
--   traders         the public profile and Reputation, readable by any Trader
--   trader_private  fields only the owner may read, such as their City
-- Clients never write either table: every change goes through a named RPC
-- (ADR-0001).

create table public.traders (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Null until the Trader finishes onboarding.
  display_name text check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 40
  ),
  -- Reserved for later tickets: the verified badge (ticket #26), the public
  -- ban mark (#28), and the denormalized Reputation counters (#27).
  verified_at timestamptz,
  banned_at timestamptz,
  completed_trade_count integer not null default 0 check (completed_trade_count >= 0),
  cancellation_count integer not null default 0 check (cancellation_count >= 0),
  no_show_count integer not null default 0 check (no_show_count >= 0),
  feedback_up_count integer not null default 0 check (feedback_up_count >= 0),
  feedback_down_count integer not null default 0 check (feedback_down_count >= 0),
  -- Member-since, shown on Reputation.
  created_at timestamptz not null default now()
);

create table public.trader_private (
  trader_id uuid primary key references public.traders (id) on delete cascade,
  -- Null until the Trader finishes onboarding.
  city_id uuid references public.cities (id)
);

revoke all on public.traders, public.trader_private
  from public, anon, authenticated;
alter table public.traders enable row level security;
alter table public.trader_private enable row level security;

grant select on public.traders, public.trader_private to authenticated;

create policy "Any signed-in Trader can read public profiles"
  on public.traders for select
  to authenticated
  using (true);

create policy "A Trader can read their own private fields"
  on public.trader_private for select
  to authenticated
  using (trader_id = (select auth.uid()));

-- Every new auth user becomes a Trader with an empty profile.
create function public.create_trader_for_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.traders (id) values (new.id);
  insert into public.trader_private (trader_id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.create_trader_for_new_user()
  from public, anon, authenticated;

create trigger create_trader_for_new_user
  after insert on auth.users
  for each row execute function public.create_trader_for_new_user();

-- Sets the calling Trader's display name and City. It takes no Trader id, so
-- a Trader can only ever change their own profile.
create function public.set_trader_profile(display_name text, city_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'set_trader_profile requires a signed-in Trader'
      using errcode = '42501';
  end if;
  if set_trader_profile.display_name is null
    or set_trader_profile.city_id is null then
    raise exception 'display_name and city_id are required'
      using errcode = '23502';
  end if;

  update public.traders
    set display_name = btrim(set_trader_profile.display_name)
    where id = caller;
  update public.trader_private
    set city_id = set_trader_profile.city_id
    where trader_id = caller;
end;
$$;

revoke execute on function public.set_trader_profile(text, uuid)
  from public, anon;
grant execute on function public.set_trader_profile(text, uuid)
  to authenticated;
