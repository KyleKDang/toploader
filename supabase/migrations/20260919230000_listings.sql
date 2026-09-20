-- A Listing is a Copy a Trader has published as available for trading, with
-- photos of that actual Copy. It is its own thing with its own lifecycle,
-- not a flag on a Collection entry.
--
-- Clients never write these tables: a Listing is created and withdrawn
-- through the named RPCs below (ADR-0001).

-- A Listing carries the Condition of the Copy on `public.card_condition`,
-- the scale the Collection migration declares (#16). It is one scale for the
-- whole app, so a Copy owned, listed, and wanted is graded the same way.

-- A Listing's life: it goes active, may be committed to a Trade, and ends
-- either traded or withdrawn. The transitions themselves are enforced by the
-- trigger below, not by whoever writes the column.
create type public.listing_status as enum (
  'active',
  'in_trade',
  'traded',
  'withdrawn'
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders (id) on delete cascade,
  card_variant_id integer not null references public.card_variants (id),
  condition public.card_condition not null,
  -- Cash passes in person and the app never touches it (ADR-0004), so both
  -- of these are ways of saying what the Trader wants, not a payment.
  asking_price_cents integer check (asking_price_cents >= 0),
  open_to_cash_offers boolean not null default false,
  status public.listing_status not null default 'active',
  created_at timestamptz not null default now(),
  -- When the reaper may reclaim the photos, and null whenever it may not.
  withdrawn_at timestamptz,
  check ((status = 'withdrawn') = (withdrawn_at is not null))
);

-- Browse asks for the Listings of one Card's Variants within a City; the
-- Trader's own Listings are read by owner.
create index listings_card_variant_id_idx on public.listings (card_variant_id);
create index listings_trader_id_idx on public.listings (trader_id);

-- The photographs of the actual Copy, 1 to 5 of them, in the order they were
-- taken. Each row names two objects in the bucket below: the full-size WebP
-- and the thumbnail that browse and Matches serve instead of it.
create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  path text not null unique,
  thumbnail_path text not null unique,
  unique (listing_id, position)
);

-- No client role holds a privilege until granted below (deny_by_default), and
-- RLS filters whatever a grant lets through. Select is the only grant: every
-- write goes through an RPC.
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;

grant select on public.listings, public.listing_photos to authenticated;

-- A Trader always sees their own Listings, whatever state they are in: a
-- withdrawn one is still theirs.
create policy "A Trader can read their own Listings"
  on public.listings for select
  to authenticated
  using (trader_id = (select auth.uid()));

-- City browse. A Trader trades within their City, so that is the only place
-- another Trader's Listing is visible, and only while it is live: a traded
-- or withdrawn Listing leaves browse here, in the policy, rather than in
-- whichever query happens to remember to filter it out.
--
-- The City is the owner's own, read through `traders`, so a Listing has no
-- second copy of it that could disagree, and a Trader who moves takes their
-- Listings with them.
create policy "A Trader can read the live Listings of their City"
  on public.listings for select
  to authenticated
  using (
    status in ('active', 'in_trade')
    and (
      select traders.city_id from public.traders
      where traders.id = listings.trader_id
    ) = (
      select traders.city_id from public.traders
      where traders.id = (select auth.uid())
    )
  );

create policy "A Trader can read the photos of a Listing they can read"
  on public.listing_photos for select
  to authenticated
  using (
    exists (
      select 1 from public.listings
      where listings.id = listing_photos.listing_id
    )
  );

-- The photos themselves. The bucket is private, so reading one is a
-- permission question rather than a matter of knowing its URL, and it
-- carries its own limits: a client that skips the browser's compression path
-- still cannot store anything but a small WebP.
--
-- 512 KiB is headroom over the ~200 KB the browser path produces, not a
-- second opinion about it. The 1 GB free tier holds roughly 4,300 photos
-- (ADR-0006), so the ceiling is what keeps that arithmetic true.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('listing-photos', 'listing-photos', false, 524288, array['image/webp']);

-- A Trader writes only under their own prefix, which is what lets the photos
-- be uploaded before the Listing that will name them exists.
create policy "A Trader can upload Listing photos under their own prefix"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Who may see a photo is not a second rule: it is whether the Trader can
-- read the `listing_photos` row that names it, which is whether they can
-- read the Listing. So City scoping and the lifecycle reach the files
-- through the same policies that scope the rows, and a withdrawn Listing's
-- photos stop being served the moment it is withdrawn.
create policy "A Trader can read the photo files of a Listing they can read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and exists (
      select 1 from public.listing_photos
      where listing_photos.path = storage.objects.name
        or listing_photos.thumbnail_path = storage.objects.name
    )
  );

-- Publishes a Listing of a Copy the Trader is holding, with the photos they
-- have already uploaded. It takes no Trader id, so a Trader can only ever
-- list as themselves.
--
--   photos  [{"path": "...", "thumbnail_path": "..."}], in the order taken
create function public.create_listing(
  card_variant_id integer,
  condition public.card_condition,
  photos jsonb,
  asking_price_cents integer default null,
  open_to_cash_offers boolean default false
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  new_listing uuid;
begin
  if caller is null then
    raise exception 'create_listing requires a signed-in Trader'
      using errcode = '42501';
  end if;

  if jsonb_typeof(create_listing.photos) is distinct from 'array'
    or jsonb_array_length(create_listing.photos) not between 1 and 5 then
    raise exception 'a Listing needs 1 to 5 photos of the Copy'
      using errcode = '22023';
  end if;

  -- The photos must be this Trader's own uploads. Both halves are checked:
  -- the prefix says who uploaded them, and the object has to be there, so a
  -- Listing never points at a photo that does not exist.
  if exists (
    select 1 from jsonb_array_elements(create_listing.photos) as photo (value)
    where photo.value->>'path' is null
      or photo.value->>'thumbnail_path' is null
      or split_part(photo.value->>'path', '/', 1) <> caller::text
      or split_part(photo.value->>'thumbnail_path', '/', 1) <> caller::text
  ) then
    raise exception 'a Listing photo must be one the Trader uploaded'
      using errcode = '42501';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(create_listing.photos) as photo (value)
      cross join lateral (values
        (photo.value->>'path'), (photo.value->>'thumbnail_path')
      ) as named (path)
      where not exists (
        select 1 from storage.objects
        where storage.objects.bucket_id = 'listing-photos'
          and storage.objects.name = named.path
      )
  ) then
    raise exception 'a Listing photo must be uploaded before the Listing'
      using errcode = '22023';
  end if;

  -- A Listing goes active in the Trader's City, so they need one.
  if not exists (
    select 1 from public.traders
    where traders.id = caller and traders.city_id is not null
  ) then
    raise exception 'a Trader must pick their City before listing'
      using errcode = '22023';
  end if;

  insert into public.listings (
    trader_id, card_variant_id, condition, asking_price_cents,
    open_to_cash_offers
  )
    values (
      caller,
      create_listing.card_variant_id,
      create_listing.condition,
      create_listing.asking_price_cents,
      create_listing.open_to_cash_offers
    )
    returning id into new_listing;

  insert into public.listing_photos (listing_id, position, path, thumbnail_path)
    select
      new_listing,
      photo.ordinality,
      photo.value->>'path',
      photo.value->>'thumbnail_path'
    from jsonb_array_elements(create_listing.photos)
      with ordinality as photo (value, ordinality);

  return new_listing;
end;
$$;

grant execute on function public.create_listing(
  integer, public.card_condition, jsonb, integer, boolean
) to authenticated;

-- The lifecycle itself, in one place, so that every RPC that moves a Listing
-- is held to it rather than each one carrying its own copy of the rules. The
-- Trade machine writes `in_trade` and `traded` from its own RPCs (#21, #25);
-- this is what those will be held to when they arrive.
--
--   active    -> in_trade   committed to a Trade
--   active    -> withdrawn  taken down by its Trader
--   in_trade  -> active     the Trade was cancelled or no-showed
--   in_trade  -> traded     the Trade completed
--
-- traded and withdrawn are terminal, and a terminal Listing is frozen whole:
-- a traded one is the Trade Record's evidence, and a withdrawn one is what
-- the reaper goes on. Neither may be edited back into circulation.
create function public.enforce_listing_lifecycle()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if old.status in ('traded', 'withdrawn')
    or (
      new.status is distinct from old.status
      and old.status::text || ' to ' || new.status::text not in (
        'active to in_trade',
        'active to withdrawn',
        'in_trade to active',
        'in_trade to traded'
      )
    )
  then
    raise exception 'a Listing cannot go from % to %', old.status, new.status
      using errcode = '22023';
  end if;

  -- The day the photos became reclaimable, kept here so it cannot disagree
  -- with the status whoever wrote it had in mind.
  if new.status = 'withdrawn' then
    new.withdrawn_at := coalesce(new.withdrawn_at, now());
  end if;

  return new;
end;
$$;

create trigger enforce_listing_lifecycle
  before update on public.listings
  for each row execute function public.enforce_listing_lifecycle();

-- Takes a Listing down. It takes no Trader id, so a Trader can only withdraw
-- their own, and it says nothing about a Listing that is not theirs, so it
-- cannot be used to find out what another Trader has listed. Which states it
-- may be called from is the trigger's answer, not a second copy here.
create function public.withdraw_listing(listing_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  owner uuid;
begin
  if caller is null then
    raise exception 'withdraw_listing requires a signed-in Trader'
      using errcode = '42501';
  end if;

  select trader_id into owner
    from public.listings where id = withdraw_listing.listing_id;

  if owner is distinct from caller then
    raise exception 'a Trader can only withdraw their own Listing'
      using errcode = '42501';
  end if;

  update public.listings
    set status = 'withdrawn'
    where id = withdraw_listing.listing_id;
end;
$$;

grant execute on function public.withdraw_listing(uuid) to authenticated;

-- Files in the bucket that no Listing names, older than the moment given.
-- The reaper needs them because a Trader may write under their own prefix
-- before the Listing exists, so an upload nobody finished is a file nothing
-- will ever point at. Walking the bucket from outside would mean one
-- request per Trader prefix; this is one question instead.
--
-- It runs as its caller, and service_role is the only caller: no Trader may
-- execute it, and it would tell them nothing they could not already read.
create function public.unreferenced_listing_photos(uploaded_before timestamptz)
  returns table (path text)
  language sql
  set search_path = ''
as $$
  select objects.name
    from storage.objects
    where objects.bucket_id = 'listing-photos'
      and objects.created_at < unreferenced_listing_photos.uploaded_before
      and not exists (
        select 1 from public.listing_photos
        where listing_photos.path = objects.name
          or listing_photos.thumbnail_path = objects.name
      );
$$;

-- The reaper is the one writer of these tables that is not an RPC, and it
-- connects as service_role, the server-side identity no client holds. It
-- reads what is withdrawn and forgets those photos; it never writes a
-- Listing.
grant select on public.listings to service_role;
grant select, delete on public.listing_photos to service_role;
grant execute on function public.unreferenced_listing_photos(timestamptz)
  to service_role;
