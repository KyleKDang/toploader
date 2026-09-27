-- How a Trade ends (#25): completed, cancelled, or a no-show, each terminal
-- (ADR-0005).
--
-- At the Meetup each Trader taps Complete, and the second tap completes the
-- Trade, which is then its Trade Record: frozen whole by the lifecycle
-- trigger, its items and Listings frozen with it. Before that either Trader
-- may cancel, and once the Meetup's time has passed one may report the
-- other absent. A cancel or a no-show releases the Trade's Listings back to
-- active; a completion trades them.

-- `proposer_completed_at` and `recipient_completed_at` are each side's
-- Complete tap, and `completed_at` is when the second landed. A cancel
-- records who cancelled and a no-show who was absent, because those are
-- what Reputation counts against a Trader (#27), and this is the only
-- moment either fact is known.
alter table public.trades
  add column proposer_completed_at timestamptz,
  add column recipient_completed_at timestamptz,
  add column completed_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.traders (id),
  add column no_show_at timestamptz,
  add column absent_trader_id uuid references public.traders (id),
  -- A tap is made at a Meetup, so only on a scheduled Trade; a Trade that
  -- ended after one tap keeps it.
  add constraint trades_completed_tap_check check (
    (proposer_completed_at is null and recipient_completed_at is null)
      or status in ('scheduled', 'completed', 'cancelled', 'no_show')
  ),
  add constraint trades_completed_check check (
    (status = 'completed') = (completed_at is not null)
      and (completed_at is null
        or (proposer_completed_at is not null
          and recipient_completed_at is not null))
  ),
  add constraint trades_cancelled_check check (
    (status = 'cancelled') = (cancelled_at is not null)
      and (cancelled_at is null) = (cancelled_by is null)
      and cancelled_by in (proposer_id, recipient_id)
  ),
  add constraint trades_no_show_check check (
    (status = 'no_show') = (no_show_at is not null)
      and (no_show_at is null) = (absent_trader_id is null)
      and absent_trader_id in (proposer_id, recipient_id)
  );

-- The Trade Record is read whole by both its Traders, the other side's
-- Listings and their photos included. City browse stops showing a Listing
-- once it is traded, so without this a Trader would lose sight of what
-- they received the moment they received it.
--
-- Only a completed Trade opens its Listings this way. A Trade that ended
-- otherwise hands them back to their Traders, who may withdraw them, and a
-- withdrawn Listing is nobody else's to see.
create policy "A Trader can read the Listings of their Trade Records"
  on public.listings for select
  to authenticated
  using (
    exists (
      select 1
        from public.trade_items
          join public.trades on trades.id = trade_items.trade_id
        where trade_items.listing_id = listings.id
          and trades.status = 'completed'
    )
  );

-- The Trade's Listings, locked in one order for the reason accept_trade
-- gives, and moved from in_trade to the given status: traded when the Trade
-- completes, active when it ends any other way. A Trade still proposed
-- never committed them, so it has nothing to move, and they may be
-- committed to another Trade entirely.
create function public.release_trade_listings(
  trade public.trades,
  status public.listing_status
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if trade.status = 'proposed' then
    return;
  end if;

  perform 1 from public.listings
    where listings.id in (
      select trade_items.listing_id from public.trade_items
      where trade_items.trade_id = trade.id
    )
    order by listings.id
    for update;

  update public.listings
    set status = release_trade_listings.status
    where listings.id in (
      select trade_items.listing_id from public.trade_items
      where trade_items.trade_id = trade.id
    );
end;
$$;

-- One Trader's Complete tap at the Meetup. The first records their side;
-- the second completes the Trade and trades its Listings. A Trader taps
-- once: the Trade waits on the other's.
create function public.complete_trade(trade_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := public.require_trader(verified => false);
  trade public.trades :=
    public.trade_for_participant(complete_trade.trade_id, caller);
begin
  if trade.status <> 'scheduled' then
    raise exception 'a Trade is completed only at its scheduled Meetup'
      using errcode = '22023';
  end if;

  if (caller = trade.proposer_id and trade.proposer_completed_at is not null)
    or (caller = trade.recipient_id and trade.recipient_completed_at is not null)
  then
    raise exception 'this Trade is waiting on the other Trader to complete it'
      using errcode = '22023';
  end if;

  update public.trades
    set proposer_completed_at = case
          when caller = trades.proposer_id then now()
          else trades.proposer_completed_at
        end,
        recipient_completed_at = case
          when caller = trades.recipient_id then now()
          else trades.recipient_completed_at
        end
    where trades.id = trade.id
    returning * into trade;

  if trade.proposer_completed_at is not null
    and trade.recipient_completed_at is not null then
    perform public.release_trade_listings(trade, 'traded');
    update public.trades
      set status = 'completed',
          completed_at = now()
      where trades.id = trade.id;
  end if;
end;
$$;

-- Ends a Trade that has not completed, for either Trader. A proposal is
-- the exception: the Trader it waits on declines it rather than cancelling
-- it, since a cancellation counts against Reputation and turning down an
-- offer does not (#21), so only its proposer may withdraw it.
create function public.cancel_trade(trade_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := public.require_trader(verified => false);
  trade public.trades :=
    public.trade_for_participant(cancel_trade.trade_id, caller);
begin
  if public.trade_has_ended(trade.status) then
    raise exception 'a % Trade cannot be cancelled', trade.status
      using errcode = '22023';
  end if;

  if trade.status = 'proposed' and trade.responder_id = caller then
    raise exception 'a proposal waiting on your answer is declined, not cancelled'
      using errcode = '22023';
  end if;

  perform public.release_trade_listings(trade, 'active');

  update public.trades
    set status = 'cancelled',
        responder_id = null,
        cancelled_at = now(),
        cancelled_by = caller
    where trades.id = trade.id;
end;
$$;

-- Reports the other Trader absent from a scheduled Meetup, once its time
-- has passed: nobody is late to a Meetup that has not started. A Trader
-- who has tapped Complete has said the Meetup happened, so cannot; the
-- other still may, since a tap can be made from anywhere.
create function public.mark_no_show(trade_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  caller uuid := public.require_trader(verified => false);
  trade public.trades :=
    public.trade_for_participant(mark_no_show.trade_id, caller);
begin
  if trade.status <> 'scheduled' then
    raise exception 'a no-show is reported only on a scheduled Trade'
      using errcode = '22023';
  end if;

  if trade.meetup_at > now() then
    raise exception 'a no-show is reported once the Meetup''s time has passed'
      using errcode = '22023';
  end if;

  if (caller = trade.proposer_id and trade.proposer_completed_at is not null)
    or (caller = trade.recipient_id and trade.recipient_completed_at is not null)
  then
    raise exception 'you have completed this Trade, so cannot report a no-show'
      using errcode = '22023';
  end if;

  perform public.release_trade_listings(trade, 'active');

  update public.trades
    set status = 'no_show',
        no_show_at = now(),
        absent_trader_id = public.other_trader(trade, caller)
    where trades.id = trade.id;
end;
$$;

grant execute on function
  public.complete_trade(uuid),
  public.cancel_trade(uuid),
  public.mark_no_show(uuid)
  to authenticated;
