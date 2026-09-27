-- The notification claim, bounded (#75).
--
-- claim_notifications used to mark every silent row in the outbox sent
-- before claiming a batch: every unsent push-only row whose Trader has no
-- browser subscribed, however many there were and however old. Once there
-- were enough of them that one statement outlasted the API's statement
-- timeout, every call was canceled and rolled back, nothing was settled or
-- claimed, and the outbox never drained again.
--
-- Now a call takes the oldest `batch` rows that are its to take, in the
-- order notifications_pending_idx holds them, and does both jobs on those
-- alone: a silent row is marked sent there and then, and every other row is
-- claimed and handed out. However large the backlog, a call reads and
-- writes at most `batch` rows, and a backlog larger than one call drains
-- over the calls after it.
--
-- A call can therefore settle a batch of silent rows and have nothing to
-- hand out while deliverable rows wait behind them, so it says how many it
-- settled as well as what it claimed, and the notifier keeps going while a
-- call did either (supabase/functions/_shared/notify.ts).
--
-- The return shape changes, so the function is dropped and made again. In
-- the seconds between CI's `db push` and its `functions deploy`, a notifier
-- deployed before this cannot read what a call returns and fails its run;
-- the rows that call claimed are sent when their claim lapses.
drop function public.claim_notifications(integer);

-- Hands the notifier a batch of rows to send, marking each as claimed in the
-- same statement. `for update skip locked` is what makes two runs at once
-- safe: each takes rows the other has not, and neither waits.
--
-- A row older than a day is left alone: a "new match" from last week is
-- noise, and this is where an outbox that could not be drained for a while
-- (the notifier unconfigured, its secrets not yet set) is kept from
-- flushing every stale row the moment it can. Until then a row that keeps
-- failing keeps being retried, every five minutes as its claim lapses,
-- because email is the reliability floor and a Resend outage is not a
-- reason to lose a verification result; each failing run is a Sentry error,
-- so a row that fails all day is not failing quietly.
--
-- A push-only row for a Trader with no browser subscribed is nothing to
-- send, and is marked sent here rather than handed out: most Traders will
-- not have alerts on, and a Listing in a busy City would otherwise cost the
-- notifier two round trips per silent Trader to find that out. It is found
-- among the rows the call takes, inside the same day, so settling never
-- walks the stale rows at the head of the pending index; a day-old silent
-- row stays unsent like any other day-old row.
--
-- Returns `{"settled": <rows marked sent>, "claimed": [<rows to send>]}`.
-- The recipient's address rides along from auth.users, which this function
-- can read and the notifier cannot, so it never needs the Auth admin API.
create function public.claim_notifications(batch integer default 20)
  returns jsonb
  language sql
  security definer
  set search_path = ''
as $$
  with taken as (
    select n.id, n.trader_id, n.channels
      from public.notifications n
      where n.sent_at is null
        and n.created_at > now() - interval '1 day'
        and (n.claimed_at is null
          or n.claimed_at < now() - interval '5 minutes')
      order by n.created_at
      limit batch
      for update skip locked
  ),
  settled as (
    update public.notifications n
      set push_sent_at = now(),
          sent_at = now()
      from taken
      where n.id = taken.id
        and taken.channels = '{push}'
        and not exists (
          select 1 from public.push_subscriptions subscription
          where subscription.trader_id = taken.trader_id
        )
      returning n.id
  ),
  claimed as (
    update public.notifications n
      set claimed_at = now(),
          attempts = n.attempts + 1
      from taken, auth.users account
      where n.id = taken.id
        and not exists (select 1 from settled where settled.id = taken.id)
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

grant execute on function public.claim_notifications(integer) to service_role;
