-- A Founder is a Trader who also holds administrative rights over the app:
-- reviewing verification requests, reading reports, and banning. They are an
-- ordinary Trader account with a row here, and that row is the whole of the
-- right (ADR-0007).
--
-- Membership is granted only by migration. No RPC, edge function, or screen
-- writes this table, so there is no path by which a running app, or a
-- Founder inside it, can make another: a grant is a reviewed commit.
create table public.founders (
  trader_id uuid primary key references public.traders (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Deny-all: RLS is on, no policy is written, and no client role is granted
-- anything. Who the Founders are is read only through is_founder() below.
alter table public.founders enable row level security;

-- Whether the calling Trader is a Founder. It is what every founder policy
-- asks, so the rule is written once; it runs as its owner because the table
-- it reads is closed to its caller, and it answers only about the caller, so
-- it tells a Trader nothing about anyone else.
create function public.is_founder()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.founders
    where founders.trader_id = (select auth.uid())
  );
$$;

grant execute on function public.is_founder() to authenticated;
