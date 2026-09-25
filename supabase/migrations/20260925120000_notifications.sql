-- Notifications: how the app reaches a Trader who is not looking at it.
-- Three pieces, and how they are set in motion:
--
--   push_subscriptions  each browser a Trader has said yes to alerts in
--   notifications       the outbox: one row per Trader per event, written in
--                       the same transaction as the event, sent by the
--                       notifier (supabase/functions/notify) and kept
--   wake_notifier()     tells the notifier there is work: on every insert,
--                       and once a minute in case a wake was lost
--
-- Which channels an event goes out on is the spec's notification matrix,
-- held here as notification_channels() so a producer cannot get it wrong.
-- The notifier does what a row says (ADR-0008).

-- pg_net makes HTTP requests from the database; pg_cron runs a statement on
-- a schedule. Both are how the notifier gets called at all: nothing else in
-- the stack can start an edge function without a client asking for it.
-- Supabase's image grants postgres what it needs on the cron schema as the
-- extension is created; granting it again here builds a chain of
-- privileges that its own script then cannot revoke.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- One row per browser: the push service's endpoint for it and the two keys
-- the browser generated, which the notifier encrypts each message to
-- (RFC 8291). The endpoint is unique on its own, not per Trader, because a
-- browser has one subscription whoever is signed in on it.
--
-- The endpoint is https or nothing. A browser never hands out anything
-- else (RFC 8030), and the notifier posts to whatever is stored here, so a
-- plain-http endpoint would let a Trader point it at any host they liked.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null check (p256dh <> ''),
  auth text not null check (auth <> ''),
  created_at timestamptz not null default now()
);

create index push_subscriptions_trader_id_idx
  on public.push_subscriptions (trader_id);

-- A Trader reads their own. Writes go through the two RPCs below; the
-- notifier, as service_role, reads every Trader's and drops the ones the
-- push service says are gone.
alter table public.push_subscriptions enable row level security;

grant select on public.push_subscriptions to authenticated;
grant select, delete on public.push_subscriptions to service_role;

create policy "A Trader can read their own push subscriptions"
  on public.push_subscriptions for select
  to authenticated
  using (trader_id = (select auth.uid()));

-- Saves the browser's subscription to the calling Trader. An endpoint saved
-- before, by anyone, is taken over: the browser is now theirs, and the keys
-- are replaced because a browser that re-subscribes makes new ones.
create function public.save_push_subscription(
  endpoint text,
  p256dh text,
  auth text
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
  -- The parameters are named for the columns they fill, which is the API a
  -- client calls; this says a bare name in the SQL below means the column.
  #variable_conflict use_column
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'save_push_subscription requires a signed-in Trader'
      using errcode = '42501';
  end if;

  insert into public.push_subscriptions (trader_id, endpoint, p256dh, auth)
    values (
      caller,
      save_push_subscription.endpoint,
      save_push_subscription.p256dh,
      save_push_subscription.auth
    )
  on conflict (endpoint) do update
    set trader_id = excluded.trader_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        created_at = now();
end;
$$;

-- Removes the browser's subscription, as signing out does. Only the caller's
-- own is ever removed, and one that is not theirs, or is already gone, is
-- nothing to do rather than an error: a browser signing out should never be
-- stopped by the state of a row it does not own.
create function public.remove_push_subscription(endpoint text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'remove_push_subscription requires a signed-in Trader'
      using errcode = '42501';
  end if;

  delete from public.push_subscriptions
    where trader_id = caller
      and push_subscriptions.endpoint = remove_push_subscription.endpoint;
end;
$$;

grant execute on function public.save_push_subscription(text, text, text)
  to authenticated;
grant execute on function public.remove_push_subscription(text)
  to authenticated;

-- The events a Trader can be told about: every row of the spec's
-- notification matrix, declared together so a later ticket adds a producer
-- rather than an enum value, which Postgres will not let a transaction use
-- in the migration that adds it.
create type public.notification_kind as enum (
  'new_match',
  'new_proposal',
  'proposal_accepted',
  'proposal_countered',
  'meetup_confirmed',
  'meetup_reminder',
  'chat_message',
  'verification_result'
);

create type public.notification_channel as enum ('push', 'email');

-- The notification matrix (docs/mvp-spec.md). Everything is pushed; email
-- is the reliability floor for the events a Trader must not miss, and is
-- left off the chatty ones.
create function public.notification_channels(kind public.notification_kind)
  returns public.notification_channel[]
  language sql
  immutable
  set search_path = ''
as $$
  select case kind
    when 'new_match' then '{push}'
    when 'new_proposal' then '{push,email}'
    when 'proposal_accepted' then '{push,email}'
    when 'proposal_countered' then '{push,email}'
    when 'meetup_confirmed' then '{push,email}'
    when 'meetup_reminder' then '{push}'
    when 'chat_message' then '{push}'
    when 'verification_result' then '{push,email}'
  end::public.notification_channel[]
$$;

-- The outbox. A producer writes the row in the same transaction as the
-- event it is about, so an event that commits has its notification and one
-- that rolls back has none. Each row is rendered when it is written: the
-- notifier carries text to a browser or an inbox and knows nothing about
-- Listings or Trades.
--
-- Delivery is recorded per channel, so a run that pushed and then failed to
-- email retries only the email. `sent_at` is set once every channel the
-- row's kind asks for is done, and is what the claim below keys on.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders (id) on delete cascade,
  kind public.notification_kind not null,
  channels public.notification_channel[] not null
    generated always as (public.notification_channels(kind)) stored,
  -- What the row is about, as one string: `match:<listing>:<wanter>` for a
  -- Match, and the Trade for everything on one (#21, #24). A browser
  -- collapses notifications with the same tag into one, so a retried Match
  -- alert replaces itself and a chat's messages pile into one entry rather
  -- than filling the tray.
  topic text not null check (topic <> ''),
  title text not null check (title <> ''),
  body text not null check (body <> ''),
  -- The app path a tap or a link opens.
  url text not null check (url ~ '^/'),
  created_at timestamptz not null default now(),
  -- Claiming, so two notifier runs never send the same row: a claim holds
  -- for five minutes, long past any run, and then the row is free again for
  -- a run that finds it unsent. Each claim counts as an attempt, which is
  -- kept for the operator: how many runs a row took says how the sending
  -- is going.
  claimed_at timestamptz,
  attempts integer not null default 0,
  push_sent_at timestamptz,
  email_sent_at timestamptz,
  sent_at timestamptz
);

-- What the claim scans: the unsent rows, oldest first.
create index notifications_pending_idx
  on public.notifications (created_at)
  where sent_at is null;

-- No client role reads or writes the outbox. A row names what another
-- Trader listed or wants and outlives the pair it was about, so a Trader
-- reading it would learn things the Matches view stops telling them. The
-- notifier reads it through claim_notifications; the select is for the
-- tests and the operator.
alter table public.notifications enable row level security;

grant select on public.notifications to service_role;

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
-- notifier two round trips per silent Trader to find that out.
--
-- The recipient's address rides along from auth.users, which this function
-- can read and the notifier cannot, so it never needs the Auth admin API.
create function public.claim_notifications(batch integer default 20)
  returns table (
    id uuid,
    trader_id uuid,
    kind public.notification_kind,
    channels public.notification_channel[],
    topic text,
    title text,
    body text,
    url text,
    created_at timestamptz,
    push_sent_at timestamptz,
    email_sent_at timestamptz,
    email text
  )
  language sql
  security definer
  set search_path = ''
as $$
  update public.notifications n
    set push_sent_at = now(),
        sent_at = now()
    where n.sent_at is null
      and n.channels = '{push}'
      and not exists (
        select 1 from public.push_subscriptions subscription
        where subscription.trader_id = n.trader_id
      );

  with claimed as (
    select n.id
      from public.notifications n
      where n.sent_at is null
        and n.created_at > now() - interval '1 day'
        and (n.claimed_at is null
          or n.claimed_at < now() - interval '5 minutes')
      order by n.created_at
      limit batch
      for update skip locked
  )
  update public.notifications n
    set claimed_at = now(),
        attempts = n.attempts + 1
    from claimed, auth.users account
    where n.id = claimed.id
      and account.id = n.trader_id
    returning
      n.id, n.trader_id, n.kind, n.channels, n.topic, n.title, n.body,
      n.url, n.created_at, n.push_sent_at, n.email_sent_at,
      account.email::text;
$$;

-- Records one channel of a row as delivered, and the row as sent once every
-- channel its kind asks for is. Recording a channel twice changes nothing.
create function public.mark_notification_sent(
  notification_id uuid,
  channel public.notification_channel
)
  returns void
  language sql
  security definer
  set search_path = ''
as $$
  update public.notifications
    set push_sent_at = case
          when channel = 'push' then coalesce(push_sent_at, now())
          else push_sent_at
        end,
        email_sent_at = case
          when channel = 'email' then coalesce(email_sent_at, now())
          else email_sent_at
        end
    where id = notification_id;

  update public.notifications
    set sent_at = now()
    where id = notification_id
      and sent_at is null
      and (push_sent_at is not null or not ('push' = any(channels)))
      and (email_sent_at is not null or not ('email' = any(channels)));
$$;

grant execute on function public.claim_notifications(integer) to service_role;
grant execute on function
  public.mark_notification_sent(uuid, public.notification_channel)
  to service_role;

-- Tells the notifier there is work, by calling it over HTTP. Where it is and
-- what it accepts as proof the call came from here are Vault secrets,
-- because they differ per stack and one of them is a secret: `notifier_url`
-- and `notifier_secret`, set by hand on the hosted project
-- (docs/operations.md). Where they are not set, as on a fresh local stack,
-- the wake is inert and the outbox simply waits.
--
-- pg_net queues the request and sends it after this transaction commits, so
-- the notifier always finds the rows that woke it, and a rollback wakes
-- nothing.
create function public.wake_notifier()
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  notifier_url text;
  notifier_secret text;
begin
  select decrypted_secret into notifier_url
    from vault.decrypted_secrets where name = 'notifier_url';
  select decrypted_secret into notifier_secret
    from vault.decrypted_secrets where name = 'notifier_secret';
  if notifier_url is null or notifier_secret is null then
    return;
  end if;

  perform net.http_post(
    url := notifier_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || notifier_secret
    ),
    timeout_milliseconds := 5000
  );
end;
$$;

create function public.wake_notifier_on_insert()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform public.wake_notifier();
  return null;
end;
$$;

-- Once per statement, not per row: a change that queues many notifications
-- is one wake, and the notifier drains everything it finds.
create trigger wake_notifier
  after insert on public.notifications
  for each statement execute function public.wake_notifier_on_insert();

-- The sweep. A wake can be lost - the notifier was cold and slow, the push
-- service was down for that one run - and without this the row would wait
-- for the next event anywhere in the app. A minute is the latency a lost
-- wake costs.
select cron.schedule(
  'wake-notifier',
  '* * * * *',
  $$ select public.wake_notifier() $$
);

-- The first producer: a new Match tells both Traders, each in their own
-- terms. The wanting Trader is sent to the Listing, which is what they want
-- to see; the lister to their Matches, where the pairing is.
create function public.queue_match_notifications()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  topic text := format('match:%s:%s', new.listing_id, new.wanter_id);
  card_name text;
  variant_name text;
  copy_condition text;
  lister_name text;
  wanter_name text;
begin
  select card.name, variant.name, listing.condition::text,
         lister.display_name, wanter.display_name
    into card_name, variant_name, copy_condition, lister_name, wanter_name
    from public.listings listing
      join public.card_variants variant on variant.id = listing.card_variant_id
      join public.cards card on card.id = variant.card_id
      join public.traders lister on lister.id = new.lister_id
      join public.traders wanter on wanter.id = new.wanter_id
    where listing.id = new.listing_id;

  insert into public.notifications (trader_id, kind, topic, title, body, url)
    values
      (
        new.wanter_id,
        'new_match',
        topic,
        'New match',
        format('%s listed %s (%s, %s), a card you want.',
          lister_name, card_name, variant_name, copy_condition),
        '/listings/' || new.listing_id
      ),
      (
        new.lister_id,
        'new_match',
        topic,
        'New match',
        format('%s wants the %s you listed.', wanter_name, card_name),
        '/'
      );
  return null;
end;
$$;

create trigger queue_match_notifications
  after insert on public.match_events
  for each row execute function public.queue_match_notifications();
