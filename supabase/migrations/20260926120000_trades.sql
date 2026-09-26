-- A Trade is the one agreement between two Traders: a single row walking a
-- single state machine, from proposed through accepted and scheduled to
-- completed, cancelled, or no-show (ADR-0005). Proposal, Meetup, and Trade
-- Record are its phases, not separate tables.
--
--   trades       the agreement: who, where it stands, whose move it is,
--                and any cash either side brings
--   trade_items  the Listings on the table, from both sides
--
-- Clients never write either table: every step is a named RPC below
-- (ADR-0001), which is where the machine's rules live. This migration is
-- the proposal phase: propose, counter, accept, decline (#21). Scheduling
-- (#23) and completion, cancel, and no-show (#25) add their RPCs to the
-- same row.

-- Every state the Trade can be in, declared together so a later ticket adds
-- an RPC rather than an enum value.
--
-- `declined` is its own ending rather than a cancellation: a cancellation
-- counts against a Trader's Reputation, and turning down an offer is not
-- something a Trader should be marked for.
create type public.trade_status as enum (
  'proposed',
  'accepted',
  'declined',
  'scheduled',
  'completed',
  'cancelled',
  'no_show'
);

-- The proposer and recipient are who opened the Trade and who it was sent
-- to, and never change. Whose answer a proposal is waiting on does, as
-- each counter hands the ball back; that is `responder_id`, and it exists
-- only while there is a proposal to answer.
--
-- Cash passes in person and the app never touches it (ADR-0004): the two
-- cash columns are a figure the Traders agreed on, what each brings to the
-- Meetup, and nothing more. At most one side brings any, since cash both
-- ways is just a smaller amount one way.
--
-- A Trader's row is never deleted from under a Trade: which Trades survive
-- an account deletion, as a victim's Trade Record must, is #28's to decide.
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references public.traders (id),
  recipient_id uuid not null references public.traders (id),
  status public.trade_status not null default 'proposed',
  responder_id uuid references public.traders (id),
  proposer_cash_cents integer check (proposer_cash_cents > 0),
  recipient_cash_cents integer check (recipient_cash_cents > 0),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (proposer_id <> recipient_id),
  check ((status = 'proposed') = (responder_id is not null)),
  check (responder_id in (proposer_id, recipient_id)),
  check (proposer_cash_cents is null or recipient_cash_cents is null)
);

-- A Trader's Trades are read from either side.
create index trades_proposer_id_idx on public.trades (proposer_id);
create index trades_recipient_id_idx on public.trades (recipient_id);

-- The Listings on the table. Which side each is on is its owner, read from
-- the Listing: a Listing never changes hands, so a copy here could only
-- ever disagree with it. A counter replaces the whole set.
create table public.trade_items (
  trade_id uuid not null references public.trades (id) on delete cascade,
  listing_id uuid not null references public.listings (id),
  primary key (trade_id, listing_id)
);

-- Which Trades a Listing is on, for accepting one and, later, for closing
-- the others.
create index trade_items_listing_id_idx on public.trade_items (listing_id);

-- Only the two participants read a Trade. Select is the only grant: every
-- write goes through an RPC below.
alter table public.trades enable row level security;
alter table public.trade_items enable row level security;

grant select on public.trades, public.trade_items to authenticated;

create policy "A Trader can read the Trades they are party to"
  on public.trades for select
  to authenticated
  using ((select auth.uid()) in (proposer_id, recipient_id));

-- Not a second rule: whether the Trader can read the Trade.
create policy "A Trader can read the items of a Trade they can read"
  on public.trade_items for select
  to authenticated
  using (
    exists (
      select 1 from public.trades
      where trades.id = trade_items.trade_id
    )
  );

-- The machine itself, in one place, as the Listing lifecycle is: every RPC
-- that moves a Trade, in this ticket and the ones after it, is held to it
-- rather than carrying its own copy.
--
--   proposed  -> proposed   countered, the ball handed back
--   proposed  -> accepted   the Trader it waited on said yes
--   proposed  -> declined   ... or no
--   proposed  -> cancelled  withdrawn before an answer (#25)
--   accepted  -> scheduled  a Meetup agreed (#23)
--   accepted  -> cancelled
--   scheduled -> completed  both Traders confirmed (#25)
--   scheduled -> cancelled
--   scheduled -> no_show    one Trader reported the other absent (#25)
--
-- declined, completed, cancelled, and no_show are terminal, and a terminal
-- Trade is frozen whole: a completed one is the Trade Record.
create function public.enforce_trade_lifecycle()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if old.status in ('declined', 'completed', 'cancelled', 'no_show')
    or old.status::text || ' to ' || new.status::text not in (
      'proposed to proposed',
      'proposed to accepted',
      'proposed to declined',
      'proposed to cancelled',
      'accepted to scheduled',
      'accepted to cancelled',
      'scheduled to completed',
      'scheduled to cancelled',
      'scheduled to no_show'
    )
    or new.proposer_id <> old.proposer_id
    or new.recipient_id <> old.recipient_id
  then
    raise exception 'a Trade cannot go from % to %', old.status, new.status
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger enforce_trade_lifecycle
  before update on public.trades
  for each row execute function public.enforce_trade_lifecycle();

-- The rules a Trader's call on a Trade answers to before anything else:
-- signed in, and, where the step sends or accepts, a Verified Trader.
-- Verification is what the Safety Program promises about the other side of
-- a Meetup, so it gates the two steps that commit anyone to one; declining
-- commits nobody, and needs none.
create function public.trade_caller(verified_to text default null)
  returns uuid
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'a Trade needs a signed-in Trader'
      using errcode = '42501';
  end if;

  if verified_to is not null and not exists (
    select 1 from public.traders
    where traders.id = caller and traders.verified_at is not null
  ) then
    raise exception 'only a Verified Trader can % a Trade proposal',
      verified_to
      using errcode = '42501';
  end if;

  return caller;
end;
$$;

-- The Trade a participant is acting on, locked for the rest of their call so
-- that two answers to one proposal happen one after the other. A Trade the
-- caller is not party to is refused exactly as one that does not exist is,
-- so the call cannot be used to find out what Trades other Traders have.
create function public.trade_for_participant(trade_id uuid, caller uuid)
  returns public.trades
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  trade public.trades;
begin
  select * into trade
    from public.trades
    where trades.id = trade_for_participant.trade_id
    for update;

  if not found or caller not in (trade.proposer_id, trade.recipient_id) then
    raise exception 'a Trader can only act on a Trade they are party to'
      using errcode = '42501';
  end if;

  return trade;
end;
$$;

-- Accepting, declining, and countering all answer a proposal, so all three
-- need one waiting, and waiting on the caller: a Trader cannot answer their
-- own proposal, nor anything already answered.
create function public.require_turn(trade public.trades, caller uuid)
  returns void
  language plpgsql
  set search_path = ''
as $$
begin
  if trade.status <> 'proposed' or trade.responder_id <> caller then
    raise exception 'this Trade is not waiting on your answer'
      using errcode = '22023';
  end if;
end;
$$;

-- What is on the table, set by whoever is proposing: the whole set of
-- Listings from both sides, and cash from one side or neither. Written from
-- the author's side - what they offer and what they ask for - because the
-- same Trader may be the proposer on one counter and the recipient's
-- counterpart on the next, and either way means the same thing to them.
--
-- A proposal has to be a trade: at least one Listing, each side giving
-- something, every Listing on offer and belonging to one of the two
-- Traders. Proposing commits nothing, so the Listings stay active and may be
-- on other proposals too; which one wins is settled on accept.
create function public.set_trade_terms(
  trade_id uuid,
  author uuid,
  listing_ids uuid[],
  offered_cash_cents integer,
  requested_cash_cents integer
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  trade public.trades;
  other uuid;
  from_author integer;
  from_other integer;
begin
  select * into trade from public.trades where id = set_trade_terms.trade_id;
  other := case
    when author = trade.proposer_id then trade.recipient_id
    else trade.proposer_id
  end;

  if coalesce(cardinality(listing_ids), 0) = 0 then
    raise exception 'a Trade needs at least one Listing'
      using errcode = '22023';
  end if;

  if (select count(distinct id) from unnest(listing_ids) as id)
    <> cardinality(listing_ids) then
    raise exception 'a Listing can be on a Trade only once'
      using errcode = '22023';
  end if;

  if offered_cash_cents <= 0 or requested_cash_cents <= 0 then
    raise exception 'a cash amount must be more than zero'
      using errcode = '22023';
  end if;

  if offered_cash_cents is not null and requested_cash_cents is not null then
    raise exception 'cash can be on one side of a Trade, not both'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(listing_ids) as named (id)
    where not exists (
      select 1 from public.listings
      where listings.id = named.id
        and listings.status = 'active'
        and listings.trader_id in (author, other)
    )
  ) then
    raise exception 'a Trade can hold only active Listings of its two Traders'
      using errcode = '22023';
  end if;

  select
    count(*) filter (where listings.trader_id = author),
    count(*) filter (where listings.trader_id = other)
    into from_author, from_other
    from public.listings
    where listings.id = any(listing_ids);

  if (from_author = 0 and offered_cash_cents is null)
    or (from_other = 0 and requested_cash_cents is null) then
    raise exception 'each side of a Trade must give a Listing or cash'
      using errcode = '22023';
  end if;

  delete from public.trade_items where trade_items.trade_id = trade.id;
  insert into public.trade_items (trade_id, listing_id)
    select trade.id, id from unnest(listing_ids) as id;

  update public.trades
    set proposer_cash_cents = case
          when author = trade.proposer_id then offered_cash_cents
          else requested_cash_cents
        end,
        recipient_cash_cents = case
          when author = trade.proposer_id then requested_cash_cents
          else offered_cash_cents
        end
    where id = trade.id;
end;
$$;

-- Opens a Trade: the caller proposes to another Trader of their City. It
-- takes no proposer id, so a Trader can only ever propose as themselves.
create function public.create_trade(
  recipient_id uuid,
  listing_ids uuid[],
  offered_cash_cents integer default null,
  requested_cash_cents integer default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := public.trade_caller(verified_to => 'send');
  new_trade uuid;
begin
  -- Trading happens within a City, so the recipient has to be in the
  -- caller's: someone the caller could have seen a Listing of.
  if create_trade.recipient_id = caller or not exists (
    select 1
      from public.traders proposer
        join public.traders recipient
          on recipient.city_id = proposer.city_id
      where proposer.id = caller
        and recipient.id = create_trade.recipient_id
  ) then
    raise exception 'a Trade is proposed to another Trader of your City'
      using errcode = '22023';
  end if;

  insert into public.trades (proposer_id, recipient_id, responder_id)
    values (caller, create_trade.recipient_id, create_trade.recipient_id)
    returning id into new_trade;

  perform public.set_trade_terms(
    new_trade, caller, listing_ids, offered_cash_cents, requested_cash_cents
  );

  return new_trade;
end;
$$;

-- Answers a proposal with different terms, which replace the old ones whole
-- and hand the answer back to the other Trader.
create function public.counter_trade(
  trade_id uuid,
  listing_ids uuid[],
  offered_cash_cents integer default null,
  requested_cash_cents integer default null
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := public.trade_caller(verified_to => 'send');
  trade public.trades := public.trade_for_participant(trade_id, caller);
begin
  perform public.require_turn(trade, caller);

  perform public.set_trade_terms(
    trade.id, caller, listing_ids, offered_cash_cents, requested_cash_cents
  );

  update public.trades
    set responder_id = case
          when caller = trade.proposer_id then trade.recipient_id
          else trade.proposer_id
        end
    where id = trade.id;
end;
$$;

-- Says yes to a proposal, which commits every Listing on the table to the
-- Trade. A Listing another Trade took first, or one its Trader has since
-- withdrawn, fails the whole accept, and nothing changes.
create function public.accept_trade(trade_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := public.trade_caller(verified_to => 'accept');
  trade public.trades := public.trade_for_participant(trade_id, caller);
  committed integer;
begin
  perform public.require_turn(trade, caller);

  -- Only the Listings still active move, and every one must: two accepts
  -- racing for one Listing each take their own Trade's lock, not the
  -- Listing's, so this condition is what the second one fails on once the
  -- first commits.
  update public.listings
    set status = 'in_trade'
    where status = 'active'
      and id in (
        select listing_id from public.trade_items
        where trade_items.trade_id = trade.id
      );
  get diagnostics committed = row_count;

  if committed <> (
    select count(*) from public.trade_items
    where trade_items.trade_id = trade.id
  ) then
    raise exception 'a Listing on this Trade is no longer on offer'
      using errcode = '22023';
  end if;

  update public.trades
    set status = 'accepted',
        responder_id = null,
        accepted_at = now()
    where id = trade.id;
end;
$$;

-- Says no to a proposal, which ends the Trade. It commits the Trader to
-- nothing, so it needs no verification.
create function public.decline_trade(trade_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := public.trade_caller();
  trade public.trades := public.trade_for_participant(trade_id, caller);
begin
  perform public.require_turn(trade, caller);

  update public.trades
    set status = 'declined',
        responder_id = null
    where id = trade.id;
end;
$$;

grant execute on function
  public.create_trade(uuid, uuid[], integer, integer),
  public.counter_trade(uuid, uuid[], integer, integer),
  public.accept_trade(uuid),
  public.decline_trade(uuid)
  to authenticated;

-- The Trade's notifications, per the matrix (ADR-0008): a new proposal to
-- its recipient, and each answer that asks something of the other Trader -
-- a counter, or an accept - to that Trader. A decline asks nothing of
-- anyone, and the matrix has no row for it.
--
-- Everything on one Trade shares its topic, so a browser shows only the
-- latest word on it, and a tap opens the Trade. The text names the other
-- Trader and not the cards: the Listings of a proposal are written after
-- its row, so they are not there yet when this fires, and the Trade is
-- where the terms are read.
create function public.queue_trade_notifications()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  kind public.notification_kind;
  recipient uuid;
  actor uuid;
  title text;
  verb text;
begin
  if tg_op = 'INSERT' then
    kind := 'new_proposal';
    recipient := new.recipient_id;
    title := 'New trade proposal';
  elsif new.status = 'proposed'
    and new.responder_id is distinct from old.responder_id then
    kind := 'proposal_countered';
    recipient := new.responder_id;
    title := 'Trade proposal countered';
    verb := 'countered';
  elsif old.status = 'proposed' and new.status = 'accepted' then
    kind := 'proposal_accepted';
    -- Whoever the proposal was waiting on said yes; the other Trader is
    -- the one who made it.
    recipient := case
      when old.responder_id = new.proposer_id then new.recipient_id
      else new.proposer_id
    end;
    title := 'Trade proposal accepted';
    verb := 'accepted';
  else
    return null;
  end if;

  -- Who is told is one Trader of the two, and what they are told about is
  -- the other.
  actor := case
    when recipient = new.proposer_id then new.recipient_id
    else new.proposer_id
  end;

  insert into public.notifications (trader_id, kind, topic, title, body, url)
    select
      recipient,
      kind,
      'trade:' || new.id,
      title,
      case
        when verb is null then format('%s proposed a trade.', display_name)
        else format('%s %s your trade proposal.', display_name, verb)
      end,
      '/trades/' || new.id
    from public.traders
    where traders.id = actor;
  return null;
end;
$$;

create trigger queue_trade_notifications
  after insert or update of status, responder_id on public.trades
  for each row execute function public.queue_trade_notifications();
