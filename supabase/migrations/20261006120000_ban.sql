-- Banning (#28): a Founder bans a Trader, who can no longer act, and whose
-- Reputation is publicly marked from then on.
--
-- Three pieces, the same three account deletion has:
--
--   traders.banned_at    the public mark, which every Trader can read on
--                        the profile; it was reserved on traders from the
--                        start and is set here for the first time
--   the closing          a trigger on the account's own ban, so the ban in
--                        Auth and its effects here are one transaction
--   the request check    a banned Trader's session, which Auth cannot take
--                        back before it expires, is refused on every request
--
-- The `ban_trader` edge function (ADR-0007) is the door in front of these:
-- it asks the database whether its caller may ban that Trader, and then bans
-- the account through the Auth admin API, which no Postgres function running
-- as a Trader can reach. The Auth ban is what stops the Trader signing in
-- again or refreshing a session; everything else follows from the trigger.

-- How a departing Trader's open Trades end, shared by a deletion and a ban.
-- It is the deletion's step 2, moved here unchanged so the two cannot drift
-- (20260929120000_account_deletion.sql): a proposal waiting on the Trader
-- is declined, as decline_trade ends it, and anything else is cancelled in
-- their name, as cancel_trade ends it, which hands the other Trader's
-- Listings back. Not callable by a client.
create function public.end_open_trades_of(trader_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  trade public.trades;
begin
  -- Every open Trade is locked before any is ended, in one order, so that
  -- an answer landing on one of them at the same moment waits for this or
  -- finishes first, and never holds what this is waiting on.
  perform 1 from public.trades
    where (trades.proposer_id = end_open_trades_of.trader_id
        or trades.recipient_id = end_open_trades_of.trader_id)
      and not public.trade_has_ended(trades.status)
    order by trades.id
    for update;

  for trade in
    select * from public.trades
    where (trades.proposer_id = end_open_trades_of.trader_id
        or trades.recipient_id = end_open_trades_of.trader_id)
      and not public.trade_has_ended(trades.status)
    order by trades.id
  loop
    if trade.status = 'proposed'
      and trade.responder_id = end_open_trades_of.trader_id then
      update public.trades
        set status = 'declined',
            responder_id = null
        where trades.id = trade.id;
    else
      perform public.move_trade_listings(trade, 'active');

      update public.trades
        set status = 'cancelled',
            responder_id = null,
            cancelled_at = now(),
            cancelled_by = end_open_trades_of.trader_id
        where trades.id = trade.id;
    end if;
  end loop;
end;
$$;

-- The erasure, as 20260929120000_account_deletion.sql wrote it, with its
-- step 2 now the shared function above. The comment there still describes
-- every step.
create or replace function public.erase_trader_for_deleted_account()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform public.require_deletable_account(old.id);

  update public.traders set city_id = null where traders.id = old.id;
  delete from public.wants where wants.trader_id = old.id;

  perform public.end_open_trades_of(old.id);

  update public.listings
    set status = 'withdrawn'
    where listings.trader_id = old.id
      and listings.status = 'active';

  delete from public.match_events
    where match_events.lister_id = old.id or match_events.wanter_id = old.id;
  delete from public.collection_entries
    where collection_entries.trader_id = old.id;
  delete from public.push_subscriptions
    where push_subscriptions.trader_id = old.id;
  delete from public.notifications where notifications.trader_id = old.id;
  delete from public.blocks
    where blocks.blocker_id = old.id or blocks.blocked_id = old.id;
  delete from public.verification_requests
    where verification_requests.trader_id = old.id;
  delete from public.trader_private where trader_private.trader_id = old.id;

  update public.traders
    set deleted_at = now(),
        display_name = case
          when exists (
            select 1 from public.trades
            where trades.proposer_id = old.id or trades.recipient_id = old.id
          ) then traders.display_name
        end
    where traders.id = old.id;

  return old;
end;
$$;

-- Who may be banned. A Founder may not: their rights are granted and
-- removed only by migration (ADR-0007), so a Founder who has to go is
-- removed by migration first, and one Founder cannot lock the other out
-- from inside the app. Nor may a Trader whose account is deleted, which has
-- nothing left in Auth to ban.
--
-- It is its own function because it is asked twice, as the deletion's rule
-- is: by the closing below, which enforces it whoever bans the account, and
-- by require_ban_allowed, so the edge function hears the answer before it
-- calls Auth. Only service_role may call it.
create function public.require_bannable_trader(trader_id uuid)
  returns void
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.traders
    where traders.id = require_bannable_trader.trader_id
      and traders.deleted_at is null
  ) then
    raise exception 'there is no such Trader to ban'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.founders
    where founders.trader_id = require_bannable_trader.trader_id
  ) then
    raise exception 'a Founder is removed by migration, not banned'
      using errcode = '22023';
  end if;
end;
$$;

-- Whether one Trader may ban another: only a Founder bans, and only a
-- Trader who may be banned. The edge function asks this with the caller
-- Auth vouched for, since it runs as service_role, where is_founder() has
-- no caller to ask about. Only service_role may call it.
create function public.require_ban_allowed(founder_id uuid, trader_id uuid)
  returns void
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.founders
    where founders.trader_id = require_ban_allowed.founder_id
  ) then
    raise exception 'only a Founder bans a Trader'
      using errcode = '42501';
  end if;

  perform public.require_bannable_trader(require_ban_allowed.trader_id);
end;
$$;

grant execute on function
  public.require_bannable_trader(uuid),
  public.require_ban_allowed(uuid, uuid)
  to service_role;

-- The closing, run by the account's ban itself, so the two are one
-- transaction: no account banned in Auth while still trading here, and no
-- Trader marked banned who could still sign in. Like the erasure, it holds
-- for every way an account is banned, the Supabase dashboard included, and
-- whatever length the ban is given there: a ban is a ban.
--
-- What it does, in order:
--
--   1. Takes the Trader out of their City. City browse and Matching are
--      both scoped by City, so their Listings and Wants leave everyone's
--      screens at once, and this is first for the reason the erasure does
--      it first: the next step hands Listings back, and with no City the
--      Trader makes no Match on the way out and nobody is alerted to one.
--   2. Ends every Trade still open, in the Trader's name where it is not
--      simply declined. The other Trader is not left waiting on someone who
--      can no longer answer, and gets their Listings back to trade again.
--      A cancellation in the banned Trader's name is theirs to carry.
--   3. Withdraws the Trader's Listings. A traded one is left as it is, the
--      Trade Record's evidence.
--   4. Marks the row banned, which is the public mark.
--
-- Everything else of the Trader's stays. A banned account is not a deleted
-- one: it stays so its email address cannot start over (the deletion
-- refuses it for that reason), and so the Founders can still read every
-- Trade and report it touched.
create function public.close_trader_for_banned_account()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform public.require_bannable_trader(new.id);

  update public.traders set city_id = null where traders.id = new.id;

  perform public.end_open_trades_of(new.id);

  update public.listings
    set status = 'withdrawn'
    where listings.trader_id = new.id
      and listings.status = 'active';

  update public.traders
    set banned_at = coalesce(traders.banned_at, now())
    where traders.id = new.id;

  return null;
end;
$$;

-- Fires when an account goes from not banned to banned. Auth writes other
-- columns of the row on every sign-in, so the condition is on the ban
-- itself rather than on the update. Lifting a ban does not lift the mark:
-- there is no unban in the app, and one done in the dashboard leaves the
-- Trader refused by the request check below until banned_at is cleared by
-- hand (docs/operations.md).
create trigger close_trader_for_banned_account
  after update on auth.users
  for each row
  when (
    new.banned_until > now()
    and (old.banned_until is null or old.banned_until <= now())
  )
  execute function public.close_trader_for_banned_account();

-- The request check, which refused a deleted Trader's session, now refuses
-- a banned Trader's too. A ban in Auth stops a session from being
-- refreshed, but an access token already issued is accepted on its
-- signature for up to an hour (ADR-0007, amendment for #28), and in that
-- hour a banned Trader could still list, propose, and message.
--
-- Renamed rather than replaced in place, since its name says what it
-- refuses; PostgREST is pointed at the new one before the old one goes.
create function public.refuse_deleted_or_banned_trader()
  returns void
  language plpgsql
  stable
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  deleted timestamptz;
  banned timestamptz;
begin
  if caller is null then
    return;
  end if;

  select traders.deleted_at, traders.banned_at into deleted, banned
    from public.traders
    where traders.id = caller;

  if deleted is not null then
    raise exception 'this account has been deleted'
      using errcode = '42501';
  end if;

  if banned is not null then
    raise exception 'this account has been banned'
      using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.refuse_deleted_or_banned_trader()
  to anon, authenticated, service_role;

alter role authenticator
  set pgrst.db_pre_request = 'public.refuse_deleted_or_banned_trader';

notify pgrst, 'reload config';

drop function public.refuse_deleted_trader();
