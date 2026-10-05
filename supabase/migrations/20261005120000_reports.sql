-- Reporting (#28): any Trader can report another Trader, or one of their
-- Listings, with a reason, and the report lands in the Founders' admin view.
--
-- A report is read by the Founders and nobody else, its own reporter
-- included. What a Founder does about it - nothing, a word, a ban - is not
-- the reporter's to follow, and a reported Trader must never learn who
-- reported them.
--
-- A report outlives either Trader's account. The `traders` row outlives an
-- account deletion (ADR-0007, amendment for #28), and a report is the
-- Founders' record rather than the reporter's own data, so the erasure
-- leaves it alone: a scammer deleting their account must not take the
-- reports about them along.

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.traders (id) on delete cascade,
  -- The Trader reported. A Listing's report names its Trader too, so every
  -- report about one Trader reads together, and a ban acts on the Trader.
  trader_id uuid not null references public.traders (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  check (reporter_id <> trader_id),
  check (char_length(reason) between 1 and 1000 and reason = btrim(reason))
);

-- The reported-Listing policy below looks a report up by its Listing.
create index reports_listing_id_idx on public.reports (listing_id)
  where listing_id is not null;

-- Select is the only grant: a report is written by the RPCs below
-- (ADR-0001), and read only through the Founders' additive policy
-- (ADR-0007).
alter table public.reports enable row level security;

grant select on public.reports to authenticated;

create policy "A Founder can read every report"
  on public.reports for select
  to authenticated
  using ((select public.is_founder()));

-- A Founder reads a reported Listing whatever has happened to it since, so
-- a Listing withdrawn the moment it was reported is still there to judge.
-- Its photos follow, since who may see a photo is whether they can read
-- the Listing. Only reported Listings: City browse is scoped by these
-- policies rather than by its query, so a Founder reading every Listing
-- would browse every City.
--
-- The cost is that a reported Listing that is still live also shows in a
-- Founder's own browse when it is in another City, or its Trader is in a
-- block with the Founder. Founders are two, and the launch is one City.
create policy "A Founder can read a reported Listing"
  on public.listings for select
  to authenticated
  using (
    (select public.is_founder())
    and exists (
      select 1 from public.reports
      where reports.listing_id = listings.id
    )
  );

-- Files a report as the caller. Not callable by a client: the two RPCs
-- below are the ways in, and each settles who is reported first.
--
-- Reporting a Trader one has blocked, or been blocked by, is allowed: a
-- block keeps the two apart, and a report is how the Founders hear why.
-- So is reporting a deleted Trader, whose victim may report them only
-- once they are gone.
create function public.file_report(
  reported_id uuid,
  listing_id uuid,
  reason text
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  stated text := btrim(file_report.reason);
begin
  if caller is null then
    raise exception 'reporting needs a signed-in Trader'
      using errcode = '42501';
  end if;

  if stated is null or char_length(stated) not between 1 and 1000 then
    raise exception 'a report needs a reason of 1 to 1,000 characters'
      using errcode = '22023';
  end if;

  if reported_id is null or reported_id = caller then
    raise exception 'a Trader reports another Trader'
      using errcode = '22023';
  end if;

  insert into public.reports (reporter_id, trader_id, listing_id, reason)
    values (caller, reported_id, file_report.listing_id, stated);
end;
$$;

-- Reports another Trader. It takes no reporter id, so a Trader can only
-- ever report as themselves.
create function public.report_trader(trader_id uuid, reason text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.traders where traders.id = report_trader.trader_id
  ) then
    raise exception 'a Trader reports another Trader'
      using errcode = '22023';
  end if;

  perform public.file_report(report_trader.trader_id, null, reason);
end;
$$;

-- Reports another Trader's Listing, which reports its Trader with it.
create function public.report_listing(listing_id uuid, reason text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  owner uuid;
begin
  -- One's own Listing is refused as one that does not exist is, so the
  -- call says nothing about which Listings exist.
  select listings.trader_id into owner
    from public.listings
    where listings.id = report_listing.listing_id;
  if not found or owner = auth.uid() then
    raise exception 'a Trader reports another Trader''s Listing'
      using errcode = '22023';
  end if;

  perform public.file_report(owner, report_listing.listing_id, reason);
end;
$$;

grant execute on function
  public.report_trader(uuid, text),
  public.report_listing(uuid, text)
  to authenticated;
