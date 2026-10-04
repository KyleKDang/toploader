-- Verification documents no waiting request names (#88), for the photo
-- reaper to delete through the Storage API, the only way a file is removed.
--
-- A document is uploaded before the request that names it, as a Listing
-- photo is before its Listing, so a Trader who closes the tab between the
-- two leaves a government ID that no Founder will ever review. So does an
-- account deleted while its request waits: the request goes with the
-- account, and the files do not.
--
-- Only a pending request keeps a document, however long it waits: a review
-- deletes both files before it is recorded, so a reviewed request names
-- files that are already gone.
--
-- It runs as its caller, and service_role is the only caller, as for
-- unreferenced_listing_photos.
create function public.unreferenced_verification_documents(
  uploaded_before timestamptz
)
  returns table (path text)
  language sql
  set search_path = ''
as $$
  select objects.name
    from storage.objects
    where objects.bucket_id = 'verification-documents'
      and objects.created_at
        < unreferenced_verification_documents.uploaded_before
      and not exists (
        select 1 from public.verification_requests
        where verification_requests.status = 'pending'
          and (verification_requests.id_document_path = objects.name
            or verification_requests.selfie_path = objects.name)
      );
$$;

grant select on public.verification_requests to service_role;
grant execute on function public.unreferenced_verification_documents(timestamptz)
  to service_role;
