-- Trade chat: the two Traders of a Trade talking to each other, and the only
-- chat in the app (#24). A message belongs to a Trade and to nothing else,
-- so there is no way to reach another Trader except through a Trade with
-- them.
--
-- Clients never write the table: a message is sent through send_message
-- below (ADR-0001), and read through a select only the Trade's two Traders
-- pass.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades (id) on delete cascade,
  sender_id uuid not null references public.traders (id),
  body text not null,
  created_at timestamptz not null default now()
);

-- A conversation is read whole, oldest first.
create index messages_trade_id_created_at_idx
  on public.messages (trade_id, created_at);

alter table public.messages enable row level security;

grant select on public.messages to authenticated;

-- Not a second rule: whether the Trader can read the Trade.
create policy "A Trader can read the messages of a Trade they can read"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.trades
      where trades.id = messages.trade_id
    )
  );

-- Delivered live over Realtime's Postgres Changes: a Trader subscribes to
-- inserts on this table, and Realtime runs the policy above as that Trader
-- for each one, so the rule for who hears a message is the rule for who
-- reads it, in one place. Broadcast was the alternative, which would have
-- wanted its own policy on realtime.messages restating this one.
alter publication supabase_realtime add table public.messages;

-- Sends a message on a Trade as the calling Trader, who must be one of its
-- two. It takes no sender id, so a Trader can only ever speak as themselves.
create function public.send_message(trade_id uuid, body text)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := public.require_trader(verified => false);
  trade public.trades :=
    public.trade_for_participant(send_message.trade_id, caller);
  message_id uuid;
begin
  -- Chat is for arranging a Trade, so it is open while there is one to
  -- arrange. An ended Trade is frozen whole, as the lifecycle trigger holds
  -- its row: what was said stays readable, and nothing more is added.
  if trade.status in ('declined', 'completed', 'cancelled', 'no_show') then
    raise exception 'a % Trade is closed to new messages', trade.status
      using errcode = '22023';
  end if;

  -- Long enough for anything two Traders need to settle, short enough that
  -- a conversation stays a conversation.
  if coalesce(btrim(send_message.body, E' \t\r\n'), '') = ''
    or char_length(send_message.body) > 2000 then
    raise exception 'a message is 1 to 2,000 characters, not all blank'
      using errcode = '22023';
  end if;

  insert into public.messages (trade_id, sender_id, body)
    values (trade.id, caller, send_message.body)
    returning id into message_id;
  return message_id;
end;
$$;

grant execute on function public.send_message(uuid, text) to authenticated;

-- A message is pushed to the other Trader and never emailed, per the matrix
-- (ADR-0008). It shares its Trade's topic, so a browser shows only the
-- latest word on the Trade rather than one entry per message, and a tap
-- opens the Trade, where the conversation is.
--
-- The push carries the start of the message: a push service caps a payload
-- at about 4 KB once encrypted, and a message may be 2,000 characters of
-- anything.
create function public.queue_message_notification()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  trade public.trades;
begin
  select * into trade from public.trades where trades.id = new.trade_id;

  insert into public.notifications (trader_id, kind, topic, title, body, url)
    select
      public.other_trader(trade, new.sender_id),
      'chat_message',
      'trade:' || trade.id,
      'New message',
      format('%s: %s', sender.display_name,
        case
          when char_length(new.body) > 140 then left(new.body, 139) || '…'
          else new.body
        end),
      '/trades/' || trade.id
    from public.traders sender
    where sender.id = new.sender_id;
  return null;
end;
$$;

create trigger queue_message_notification
  after insert on public.messages
  for each row execute function public.queue_message_notification();
