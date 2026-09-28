-- Verification: a Trader submits a photo of their government ID and a
-- selfie, a Founder looks at both and approves or rejects, and an approved
-- Trader is a Verified Trader, which sending or accepting a Trade proposal
-- needs (require_trader, #21).
--
-- What is kept is `traders.verified_at` and the request's own row. The
-- documents are not: both files are deleted at review, whichever way it
-- goes, because holding strangers' government IDs is the largest avoidable
-- liability in the app (docs/mvp-spec.md, Verification).
--
-- A file in Storage can only be deleted through the Storage API: the rows of
-- `storage.objects` are the index of the files, not the files, and Storage
-- refuses a SQL delete on them for that reason. So an RPC cannot delete a
-- document itself, and the order is the other way round: the reviewing
-- Founder deletes both files, and the review is recorded only once they are
-- gone. Whatever fails between the two steps leaves a request still waiting
-- with no documents, never a reviewed one with documents behind it
-- (ADR-0007).

-- The documents. Private, so reading one is a permission question, and
-- limited the way the Listing photos are: the browser re-encodes what the
-- camera hands over through the same path (src/lib/photos.ts), and the
-- bucket's own limits are the enforcement a client cannot skip.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'verification-documents', 'verification-documents', false, 524288,
    array['image/webp']
  );

-- A Trader writes only under their own prefix, and only writes: there is no
-- policy by which a Trader reads a document back, their own included, or
-- replaces or deletes one. What a Founder reviews is what was sent.
create policy "A Trader can upload verification documents under their own prefix"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- A Founder reads every document, and deletes them: the additive policies
-- of ADR-0007, asked of the bucket as they are of the table below.
create policy "A Founder can read verification documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'verification-documents'
    and (select public.is_founder())
  );

create policy "A Founder can delete verification documents"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'verification-documents'
    and (select public.is_founder())
  );

create type public.verification_status as enum (
  'pending',
  'approved',
  'rejected'
);

-- One row per submission. A rejected Trader sends fresh documents as a new
-- request, so a Trader's rows are the history of their attempts, and the
-- paths of a reviewed one name files that no longer exist.
create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders (id) on delete cascade,
  id_document_path text not null unique,
  selfie_path text not null unique,
  status public.verification_status not null default 'pending',
  created_at timestamptz not null default now(),
  -- The Founder who reviewed it. Kept when that Founder's account is not,
  -- as a request reviewed by nobody we can name.
  reviewed_by uuid references public.traders (id) on delete set null,
  reviewed_at timestamptz,
  check (id_document_path <> selfie_path),
  check ((status = 'pending') = (reviewed_at is null))
);

-- A Trader has one request waiting at a time. It is also what the admin
-- view reads: the requests still to review, oldest first.
create unique index verification_requests_one_pending_idx
  on public.verification_requests (trader_id)
  where status = 'pending';

create index verification_requests_trader_id_idx
  on public.verification_requests (trader_id);

-- Select is the only grant: a request is written by the RPCs below.
alter table public.verification_requests enable row level security;

grant select on public.verification_requests to authenticated;

create policy "A Trader can read their own verification requests"
  on public.verification_requests for select
  to authenticated
  using (trader_id = (select auth.uid()));

create policy "A Founder can read every verification request"
  on public.verification_requests for select
  to authenticated
  using ((select public.is_founder()));

-- Whether a file is in the documents bucket.
create function public.verification_document_exists(path text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from storage.objects
    where objects.bucket_id = 'verification-documents'
      and objects.name = path
  );
$$;

-- Asks for the calling Trader to be verified, from the two documents they
-- have already uploaded. It takes no Trader id, so a Trader can only ever
-- ask for themselves.
create function public.submit_verification(
  id_document_path text,
  selfie_path text
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  new_request uuid;
begin
  if caller is null then
    raise exception 'submit_verification requires a signed-in Trader'
      using errcode = '42501';
  end if;

  if submit_verification.id_document_path is null
    or submit_verification.selfie_path is null
    or submit_verification.id_document_path
      = submit_verification.selfie_path then
    raise exception 'verification needs an ID photo and a selfie'
      using errcode = '22023';
  end if;

  -- The documents must be this Trader's own uploads. Both halves are
  -- checked, as create_listing checks a photo: the prefix says who uploaded
  -- them, and the file has to be there.
  if split_part(submit_verification.id_document_path, '/', 1) <> caller::text
    or split_part(submit_verification.selfie_path, '/', 1) <> caller::text
  then
    raise exception 'a verification document must be one the Trader uploaded'
      using errcode = '42501';
  end if;

  if not public.verification_document_exists(
      submit_verification.id_document_path)
    or not public.verification_document_exists(
      submit_verification.selfie_path)
  then
    raise exception 'a verification document must be uploaded before it is submitted'
      using errcode = '22023';
  end if;

  -- Locked, so that two submissions at once are answered one after the
  -- other and the second finds the first's request waiting.
  perform 1 from public.traders where traders.id = caller for update;

  if exists (
    select 1 from public.traders
    where traders.id = caller and traders.verified_at is not null
  ) then
    raise exception 'a Verified Trader has nothing left to verify'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.verification_requests
    where verification_requests.trader_id = caller
      and verification_requests.status = 'pending'
  ) then
    raise exception 'a verification request is already waiting on review'
      using errcode = '22023';
  end if;

  insert into public.verification_requests (
    trader_id, id_document_path, selfie_path
  )
    values (
      caller,
      submit_verification.id_document_path,
      submit_verification.selfie_path
    )
    returning id into new_request;

  return new_request;
end;
$$;

grant execute on function public.submit_verification(text, text)
  to authenticated;

-- The request a Founder is reviewing, locked for the rest of their call so
-- that two reviews of one request happen one after the other, or a refusal.
--
-- Who is asking is settled before the request is looked for, so a Trader who
-- is not a Founder is refused the same way for a request that exists as for
-- one that does not, and the call cannot be used to find out which do.
--
-- A Founder never reviews their own request: they are an ordinary Trader
-- account and could otherwise verify themselves (ADR-0007).
--
-- And the documents are gone before the review is recorded, which is what
-- makes it true of every reviewed request that nothing is left behind it.
create function public.verification_request_for_review(
  request_id uuid,
  caller uuid
)
  returns public.verification_requests
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  request public.verification_requests;
begin
  if caller is null or not public.is_founder() then
    raise exception 'only a Founder can review a verification request'
      using errcode = '42501';
  end if;

  select * into request
    from public.verification_requests
    where verification_requests.id = request_id
    for update;
  if not found then
    raise exception 'no such verification request'
      using errcode = 'P0002';
  end if;

  if request.trader_id = caller then
    raise exception 'a Founder cannot review their own verification request'
      using errcode = '42501';
  end if;

  if request.status <> 'pending' then
    raise exception 'this verification request has already been reviewed'
      using errcode = '55000';
  end if;

  if public.verification_document_exists(request.id_document_path)
    or public.verification_document_exists(request.selfie_path) then
    raise exception 'a verification request is reviewed once its documents are deleted'
      using errcode = '55000';
  end if;

  return request;
end;
$$;

-- Approves a request, which makes its Trader a Verified Trader. What is
-- stored of the review is this: a status, who, and when.
create function public.approve_verification(request_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  request public.verification_requests :=
    public.verification_request_for_review(request_id, caller);
begin
  update public.verification_requests
    set status = 'approved',
        reviewed_by = caller,
        reviewed_at = now()
    where verification_requests.id = request.id;

  update public.traders
    set verified_at = now()
    where traders.id = request.trader_id;
end;
$$;

-- Rejects a request. The Trader stays as they were, and sends fresh
-- documents as a new request.
create function public.reject_verification(request_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  request public.verification_requests :=
    public.verification_request_for_review(request_id, caller);
begin
  update public.verification_requests
    set status = 'rejected',
        reviewed_by = caller,
        reviewed_at = now()
    where verification_requests.id = request.id;
end;
$$;

grant execute on function
  public.approve_verification(uuid),
  public.reject_verification(uuid)
  to authenticated;

-- The verification result, per the matrix (ADR-0008): pushed and emailed to
-- the Trader who asked, in the same transaction as the review. A submission
-- tells nobody: the Trader is looking at it, and the Founders find it in
-- the admin view.
--
-- Both results say the documents are gone, because that is the promise the
-- Trader was made when they sent them. A Trader's results share one topic,
-- so a browser shows the latest: an approval replaces the rejection before
-- it.
create function public.queue_verification_notifications()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.notifications (trader_id, kind, topic, title, body, url)
    values (
      new.trader_id,
      'verification_result',
      'verification:' || new.trader_id,
      case new.status
        when 'approved' then 'You are verified'
        else 'Verification not approved'
      end,
      case new.status
        when 'approved' then
          'A founder checked your ID and selfie, and both photos have been deleted. You can now send and accept trades.'
        else
          'A founder could not verify you from the photos you sent, and both have been deleted. Send a new ID photo and selfie to try again.'
      end,
      '/verification'
    );
  return null;
end;
$$;

create trigger queue_verification_notifications
  after update of status on public.verification_requests
  for each row
  when (old.status = 'pending' and new.status <> 'pending')
  execute function public.queue_verification_notifications();
