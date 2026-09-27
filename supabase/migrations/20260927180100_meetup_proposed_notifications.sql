-- A Meetup put forward asks the other Trader for an answer, as a counter
-- does, so it is told to them the way a counter is: pushed and emailed
-- (#74). Until now nobody was told, and a Meetup the other Trader never
-- opened the Trade to see lapsed once its time passed.

-- The notification matrix (docs/mvp-spec.md), with its "Meetup proposed"
-- row.
create or replace function public.notification_channels(
  kind public.notification_kind
)
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
    when 'meetup_proposed' then '{push,email}'
    when 'meetup_confirmed' then '{push,email}'
    when 'meetup_reminder' then '{push}'
    when 'chat_message' then '{push}'
    when 'verification_result' then '{push,email}'
  end::public.notification_channel[]
$$;

-- A Meetup's notification to one of its Traders, naming the other, the
-- Safe Spot, and the time as the clocks there read it. On the Trade's
-- topic, like everything on a Trade, so a browser shows only the latest
-- word on it.
--
-- `body_format` takes the other Trader, the Safe Spot, and the time, in
-- that order; `time_format` is how the time reads (to_char).
create function public.queue_meetup_notification(
  trade public.trades,
  recipient uuid,
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
      queue_meetup_notification.recipient,
      queue_meetup_notification.kind,
      'trade:' || (queue_meetup_notification.trade).id,
      queue_meetup_notification.title,
      format(
        queue_meetup_notification.body_format,
        other.display_name,
        spot.name,
        to_char(
          (queue_meetup_notification.trade).meetup_at at time zone city.time_zone,
          queue_meetup_notification.time_format
        )
      ),
      '/trades/' || (queue_meetup_notification.trade).id
    from public.traders other
      join public.safe_spots spot
        on spot.id = (queue_meetup_notification.trade).safe_spot_id
      join public.cities city on city.id = spot.city_id
    where other.id = public.other_trader(
      queue_meetup_notification.trade,
      queue_meetup_notification.recipient
    );
$$;

-- The same notification to both Traders, as a confirmed Meetup and its
-- reminder are told. Its signature is unchanged, so its callers are too.
create or replace function public.queue_meetup_notifications(
  trade public.trades,
  kind public.notification_kind,
  title text,
  body_format text,
  time_format text
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  recipient uuid;
begin
  foreach recipient in array array[trade.proposer_id, trade.recipient_id]
  loop
    perform public.queue_meetup_notification(
      trade, recipient, kind, title, body_format, time_format
    );
  end loop;
end;
$$;

-- A Meetup put forward is told to the Trader it now waits on, whether it
-- is the first, a different one in answer to the other's, or another put
-- forward once an unconfirmed one's time has passed. That last one can
-- leave the responder as it was, so what fires this is the Meetup
-- changing, not only whom it waits on. `propose_meetup` is the only writer
-- of a Meetup; anything else that moves one on an accepted Trade would be
-- told to the other Trader the same way.
create function public.queue_meetup_proposed_notification()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform public.queue_meetup_notification(
    new, new.responder_id, 'meetup_proposed', 'Meetup proposed',
    '%s proposed a meetup at %s on %s.',
    'FMDay, FMMonth FMDD "at" FMHH12:MI AM'
  );
  return null;
end;
$$;

create trigger queue_meetup_proposed_notification
  after update of meetup_at, safe_spot_id, responder_id on public.trades
  for each row
  when (
    new.status = 'accepted'
    and new.meetup_at is not null
    and (new.meetup_at, new.safe_spot_id, new.responder_id)
      is distinct from (old.meetup_at, old.safe_spot_id, old.responder_id)
  )
  execute function public.queue_meetup_proposed_notification();
