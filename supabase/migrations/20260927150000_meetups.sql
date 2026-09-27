-- The Meetup: the scheduled phase of a Trade (ADR-0005), an agreed time at
-- a Safe Spot. It is fields on the Trade rather than a table of its own.
--
-- Once a proposal is accepted, either Trader puts forward a time and a Safe
-- Spot from their City's directory, and the other confirms it, which makes
-- the Trade scheduled (#23). Until then the other may put forward a
-- different one instead, which replaces it and hands the answer back, the
-- way a counter does to a proposal. Both Traders are told when a Meetup is
-- confirmed, and reminded before it.

-- A City's time zone, so a Meetup's time is told as the clocks there read
-- it. Cities are written only by migrations, so each names its own; the
-- launch City's is set here.
alter table public.cities add column time_zone text;
update public.cities set time_zone = 'America/Los_Angeles'
  where name = 'Orange County';
alter table public.cities alter column time_zone set not null;

-- `meetup_at` and `safe_spot_id` are the Meetup, put forward while the
-- Trade is accepted and agreed once it is scheduled. `scheduled_at` is when
-- that happened, as `accepted_at` is for the accept. `meetup_reminded_at`
-- is when the reminder was queued, so it is queued once.
alter table public.trades
  add column meetup_at timestamptz,
  add column safe_spot_id uuid references public.safe_spots (id),
  add column scheduled_at timestamptz,
  add column meetup_reminded_at timestamptz,
  add constraint trades_meetup_check
    check ((meetup_at is null) = (safe_spot_id is null)),
  add constraint trades_scheduled_check
    check (status <> 'scheduled' or scheduled_at is not null),
  add constraint trades_scheduled_meetup_check
    check (scheduled_at is null or meetup_at is not null);

-- The responder is now whoever the Trade waits on an answer from: a
-- proposal's recipient, or the Trader a Meetup was put forward to. It is
-- the same check #21 declared, widened; its name is the one Postgres gave
-- it.
alter table public.trades
  drop constraint trades_check1,
  add constraint trades_responder_check check (
    (responder_id is not null)
      = (status = 'proposed' or (status = 'accepted' and meetup_at is not null))
  );

-- What the reminder sweep scans: the scheduled Trades not yet reminded.
create index trades_meetup_reminder_idx
  on public.trades (meetup_at)
  where status = 'scheduled' and meetup_reminded_at is null;

-- The Safe Spot a Trade references is looked up from the Trade, never the
-- other way around, except when a migration retires one.
create index trades_safe_spot_id_idx on public.trades (safe_spot_id);

-- Puts a Meetup forward on an accepted Trade: a time still to come, at a
-- Safe Spot in the directory both Traders' City shares. It waits on the
-- other Trader's confirmation.
--
-- Either Trader may put one forward first. Once one is waiting, only the
-- Trader it waits on may replace it, so the Meetup a Trader confirms is
-- always the one they were shown: the Trader who put it forward cannot
-- change it under them. Once its time has passed it can no longer be
-- confirmed, so there is nothing left to change under anyone, and either
-- Trader may put forward another.
--
-- Verification is not asked again: a Trade is only accepted between two
-- Verified Traders, which is the gate on committing anyone to a Meetup.
create function public.propose_meetup(
  trade_id uuid,
  meetup_at timestamptz,
  safe_spot_id uuid
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := public.require_trader(verified => false);
  trade public.trades :=
    public.trade_for_participant(propose_meetup.trade_id, caller);
begin
  if trade.status <> 'accepted' then
    raise exception 'a Meetup is scheduled only on an accepted Trade'
      using errcode = '22023';
  end if;

  if trade.responder_id is not null
    and trade.responder_id <> caller
    and trade.meetup_at > now() then
    raise exception 'this Meetup is waiting on the other Trader'
      using errcode = '22023';
  end if;

  if propose_meetup.meetup_at is null
    or propose_meetup.meetup_at <= now() then
    raise exception 'a Meetup is scheduled for a time still to come'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.safe_spots spot
        join public.traders proposer on proposer.city_id = spot.city_id
        join public.traders recipient on recipient.city_id = spot.city_id
      where spot.id = propose_meetup.safe_spot_id
        and proposer.id = trade.proposer_id
        and recipient.id = trade.recipient_id
  ) then
    raise exception 'a Meetup is at a Safe Spot of your City'
      using errcode = '22023';
  end if;

  update public.trades
    set meetup_at = propose_meetup.meetup_at,
        safe_spot_id = propose_meetup.safe_spot_id,
        responder_id = public.other_trader(trade, caller)
    where trades.id = trade.id;
end;
$$;

-- Confirms the Meetup waiting on the caller, which schedules the Trade. A
-- Meetup whose time has passed unconfirmed cannot be confirmed; either
-- Trader puts forward another.
create function public.confirm_meetup(trade_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := public.require_trader(verified => false);
  trade public.trades :=
    public.trade_for_participant(confirm_meetup.trade_id, caller);
begin
  if trade.status <> 'accepted' or trade.responder_id is distinct from caller
  then
    raise exception 'no Meetup is waiting on your confirmation'
      using errcode = '22023';
  end if;

  if trade.meetup_at <= now() then
    raise exception 'this Meetup''s time has passed'
      using errcode = '22023';
  end if;

  update public.trades
    set status = 'scheduled',
        responder_id = null,
        scheduled_at = now()
    where trades.id = trade.id;
end;
$$;

grant execute on function
  public.propose_meetup(uuid, timestamptz, uuid),
  public.confirm_meetup(uuid)
  to authenticated;

-- How long before a Meetup its reminder is sent: time enough to see it and
-- still get there.
create function public.meetup_reminder_lead()
  returns interval
  language sql
  immutable
  set search_path = ''
as $$
  select interval '2 hours'
$$;

-- A Meetup's notification to both its Traders, each naming the other, the
-- Safe Spot, and the time as the clocks there read it. On the Trade's
-- topic, like everything on a Trade, so a browser shows only the latest
-- word on it.
--
-- `body_format` takes the other Trader, the Safe Spot, and the time, in
-- that order; `time_format` is how the time reads (to_char).
create function public.queue_meetup_notifications(
  trade public.trades,
  kind public.notification_kind,
  title text,
  body_format text,
  time_format text
)
  returns void
  language sql
  security definer
  set search_path = ''
as $$
  insert into public.notifications (trader_id, kind, topic, title, body, url)
    -- Qualified, because a Safe Spot has a `kind` of its own.
    select
      recipient.id,
      queue_meetup_notifications.kind,
      'trade:' || (queue_meetup_notifications.trade).id,
      queue_meetup_notifications.title,
      format(
        queue_meetup_notifications.body_format,
        other.display_name,
        spot.name,
        to_char(
          (queue_meetup_notifications.trade).meetup_at at time zone city.time_zone,
          queue_meetup_notifications.time_format
        )
      ),
      '/trades/' || (queue_meetup_notifications.trade).id
    from unnest(array[
        (queue_meetup_notifications.trade).proposer_id,
        (queue_meetup_notifications.trade).recipient_id
      ]) as recipient (id)
      join public.traders other
        on other.id = public.other_trader(
          queue_meetup_notifications.trade,
          recipient.id
        )
      join public.safe_spots spot
        on spot.id = (queue_meetup_notifications.trade).safe_spot_id
      join public.cities city on city.id = spot.city_id;
$$;

-- A confirmed Meetup is told to both Traders, pushed and emailed per the
-- matrix: the one who put it forward learns it was confirmed, and the
-- email is where both find the place and the time again.
create function public.queue_meetup_confirmed_notifications()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform public.queue_meetup_notifications(
    new, 'meetup_confirmed', 'Meetup confirmed',
    'Your meetup with %s at %s on %s is confirmed.',
    'FMDay, FMMonth FMDD "at" FMHH12:MI AM'
  );
  return null;
end;
$$;

create trigger queue_meetup_confirmed_notifications
  after update of status on public.trades
  for each row
  when (old.status = 'accepted' and new.status = 'scheduled')
  execute function public.queue_meetup_confirmed_notifications();

-- The reminder sweep: every scheduled Meetup now within the lead of its
-- time is reminded to both Traders, push only per the matrix, once.
--
-- A Meetup confirmed inside the lead is not reminded: its confirmation has
-- just told both Traders, and a reminder a minute later would say it again.
create function public.queue_meetup_reminders()
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  trade public.trades;
begin
  for trade in
    update public.trades
      set meetup_reminded_at = now()
      where trades.status = 'scheduled'
        and trades.meetup_reminded_at is null
        and trades.meetup_at > now()
        and trades.meetup_at <= now() + public.meetup_reminder_lead()
        and trades.scheduled_at < trades.meetup_at - public.meetup_reminder_lead()
      returning trades.*
  loop
    perform public.queue_meetup_notifications(
      trade, 'meetup_reminder', 'Meetup coming up',
      'Your meetup with %s at %s is at %s.',
      'FMHH12:MI AM'
    );
  end loop;
end;
$$;

-- Once a minute, like the notifier's own sweep, so a reminder is at most a
-- minute late on top of the notifier's.
select cron.schedule(
  'queue-meetup-reminders',
  '* * * * *',
  $$ select public.queue_meetup_reminders() $$
);
