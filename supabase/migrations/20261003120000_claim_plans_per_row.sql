-- The notification claim, planned for the rows it takes (#83).
--
-- claim_notifications is a SQL function, so its statement is planned with
-- `batch` unknown. The planner then cannot see that `taken` holds at most
-- fifty batches of rows; it guessed a share of the whole outbox, and joined
-- the two updates to it by a hash join over a sequential scan of every row
-- in public.notifications, sent ones included, and of every row in
-- auth.users. So a call read the whole table to write a thousand rows, and
-- a call's cost grew with everything the outbox had ever held rather than
-- with the batch: on a local stack of five million rows, 600 ms to 1.3 s a
-- call against 12 ms for the same statement planned with the limit known,
-- and a backlog of half a million silent rows took minutes to drain where
-- it should take seconds.
--
-- Now each update takes its rows as an array of ids, `id = any(...)`, which
-- the planner estimates as a handful and looks up by primary key whatever
-- `batch` is. What a call takes, settles, claims and returns is unchanged.
create or replace function public.claim_notifications(batch integer default 20)
  returns jsonb
  language sql
  security definer
  set search_path = ''
as $$
  with taken as (
    select n.id, n.created_at,
        n.channels = '{push}' and not exists (
          select 1 from public.push_subscriptions subscription
          where subscription.trader_id = n.trader_id
        ) as silent
      from public.notifications n
      where n.sent_at is null
        and n.created_at > now() - interval '1 day'
        and (n.claimed_at is null
          or n.claimed_at < now() - interval '5 minutes')
      order by n.created_at
      limit batch * 50
      for update of n skip locked
  ),
  settled as (
    update public.notifications n
      set push_sent_at = now(),
          sent_at = now()
      where n.id = any (array(select taken.id from taken where taken.silent))
      returning n.id
  ),
  claimed as (
    update public.notifications n
      set claimed_at = now(),
          attempts = n.attempts + 1
      from auth.users account
      where n.id = any (array(
          select taken.id from taken
            where not taken.silent
            order by taken.created_at
            limit batch
        ))
        and account.id = n.trader_id
      returning
        n.id, n.trader_id, n.kind, n.channels, n.topic, n.title, n.body,
        n.url, n.created_at, n.push_sent_at, n.email_sent_at,
        account.email::text
  )
  select jsonb_build_object(
    'settled', (select count(*) from settled),
    'claimed', coalesce(
      (select jsonb_agg(to_jsonb(claimed) order by claimed.created_at)
         from claimed),
      '[]'::jsonb
    )
  );
$$;
