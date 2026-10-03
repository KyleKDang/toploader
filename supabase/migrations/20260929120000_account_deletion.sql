-- Account deletion (#28): a Trader deletes their own account, and what was
-- private to them goes with it, while every Trade they were party to stays
-- with the Trader on the other side. A completed Trade is that Trader's
-- Trade Record, their evidence of who they met and what changed hands, and
-- it is immutable (ADR-0005); so the one thing a deletion can never do is
-- take the other side's record with it.
--
-- Three pieces:
--
--   traders.deleted_at   the Trader's row outlives the account, because
--                        Trades name it; this marks it as nobody's now
--   the erasure          a trigger on the account's own deletion, so the
--                        account is gone exactly when the data is
--   the request check    a deleted Trader's session, which Auth cannot take
--                        back before it expires, is refused on every request
--
-- The `delete_account` edge function (ADR-0007) is the door in front of
-- these: it deletes the Trader's verification documents from Storage, which
-- no SQL can, and then the account through the Auth admin API.

-- A Trader's row is no longer deleted with their account. It was tied to
-- `auth.users` with a cascade, which a Trader with any Trade could never
-- have survived: `trades` names its two Traders without one, on purpose
-- (20260926120000_trades.sql), so the cascade would have been refused and
-- the account with it.
alter table public.traders
  drop constraint traders_id_fkey,
  add column deleted_at timestamptz;

-- A deleted Trader's profile is read only by the Traders of their Trades,
-- who are reading their own Trade's other side. To everyone else the Trader
-- is gone: no browse, no lookup by id.
--
-- Which Trades count is not a second rule: the subquery reads `trades`
-- under its own policy, so it finds only the caller's. A Trader's own row
-- is theirs to read either way, which is what lets the request check below
-- run as its caller.
drop policy "Any signed-in Trader can read public profiles" on public.traders;

create policy "A Trader can read public profiles, and a deleted Trader's from a Trade with them"
  on public.traders for select
  to authenticated
  using (
    deleted_at is null
    or id = (select auth.uid())
    or exists (
      select 1 from public.trades
      where trades.proposer_id = traders.id
        or trades.recipient_id = traders.id
    )
  );

-- The erasure, run by the deletion of the account itself, so the two are
-- one transaction: there is no account left behind with its data gone, and
-- no data left behind with nobody able to ask again. It is the counterpart
-- of create_trader_for_new_account, and like it holds for every way an
-- account is deleted, the Supabase dashboard included.
--
-- What it does, in order:
--
--   1. Takes the Trader out of their City and deletes their Wants. This is
--      first because Matching follows a Listing going back on offer: the
--      next step hands Listings back, and with no City and no Wants the
--      Trader makes no Match on the way out and nobody is alerted to one.
--   2. Ends every Trade still open, as the Trader would have had to: a
--      proposal waiting on them is declined, and anything else is cancelled
--      in their name, which hands the Listings on it back. The other Trader
--      keeps the Trade, ended, and gets their Listings back to trade again.
--   3. Withdraws the Trader's Listings. A traded one is left exactly as it
--      is, photos included: it is the Trade Record's evidence. A withdrawn
--      one is out of everyone's sight at once, and the photo reaper
--      reclaims its photos on its next run.
--   4. Deletes what was the Trader's alone: Collection, Matches' history,
--      push subscriptions, notifications, blocks from either side,
--      verification requests, and the private half of the profile.
--   5. Marks the row deleted. The display name stays wherever a Trade names
--      the Trader, since its other Trader is the only one who can still read
--      it and already knew it; a Trader on no Trade leaves no name behind.
--      The name is not kept for completed Trades alone: a Trader who takes
--      the cards at a Meetup and deletes the account before tapping
--      Complete leaves a cancelled Trade, and that is the record the other
--      Trader most needs to still say who it was with.
--
-- Messages stay, as the Trades they were said on do: an ended Trade is
-- frozen whole, and what was said on it is the other Trader's to keep.
--
-- Every table that holds something of a Trader's used to be emptied by the
-- cascade from `traders`. That row now stays, so the lists in steps 1 and 4
-- are what empty them: a new table of a Trader's own data is added there.

-- Two accounts are refused. A Founder's membership is granted and removed
-- only by migration (ADR-0007), so theirs is removed first. And a banned
-- Trader keeps their account: deleting it would free the email address the
-- ban is on, and a new account under it would start unbanned.
--
-- The rule is its own function because it is asked twice: by the erasure,
-- which is what enforces it, and by the edge function before it deletes
-- anything from Storage, so that an account the erasure will refuse does
-- not lose its verification documents on the way to being refused. It runs
-- as its owner, since neither table is open to its caller, and only
-- service_role may call it: no Trader's session reaches it.
create function public.require_deletable_account(trader_id uuid)
  returns void
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if exists (
    select 1 from public.founders
    where founders.trader_id = require_deletable_account.trader_id
  ) then
    raise exception 'a Founder is removed by migration before their account is deleted'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.traders
    where traders.id = require_deletable_account.trader_id
      and traders.banned_at is not null
  ) then
    raise exception 'a banned Trader''s account is not deleted'
      using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.require_deletable_account(uuid)
  to service_role;

create function public.erase_trader_for_deleted_account()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  trade public.trades;
begin
  perform public.require_deletable_account(old.id);

  update public.traders set city_id = null where traders.id = old.id;
  delete from public.wants where wants.trader_id = old.id;

  -- Every open Trade is locked before any is ended, in one order, so that
  -- an answer landing on one of them at the same moment waits for this or
  -- finishes first, and never holds what this is waiting on.
  perform 1 from public.trades
    where (trades.proposer_id = old.id or trades.recipient_id = old.id)
      and not public.trade_has_ended(trades.status)
    order by trades.id
    for update;

  for trade in
    select * from public.trades
    where (trades.proposer_id = old.id or trades.recipient_id = old.id)
      and not public.trade_has_ended(trades.status)
    order by trades.id
  loop
    if trade.status = 'proposed' and trade.responder_id = old.id then
      -- As decline_trade ends it.
      update public.trades
        set status = 'declined',
            responder_id = null
        where trades.id = trade.id;
    else
      -- As cancel_trade ends it.
      perform public.move_trade_listings(trade, 'active');

      update public.trades
        set status = 'cancelled',
            responder_id = null,
            cancelled_at = now(),
            cancelled_by = old.id
        where trades.id = trade.id;
    end if;
  end loop;

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

create trigger erase_trader_for_deleted_account
  before delete on auth.users
  for each row execute function public.erase_trader_for_deleted_account();

-- The request check. Deleting an account ends its sessions, but a session's
-- access token is a signed pass that the API accepts on its signature alone
-- until it expires, up to an hour later (jwt_expiry). Without this, a
-- deleted Trader's token could still call every RPC in that hour and put
-- back the Collection, Wants, or verification request that deleting the
-- account had just removed.
--
-- PostgREST runs this before every request, as the caller (db_pre_request,
-- below), so it is one check in front of every read and every RPC rather
-- than one in each. It runs as its caller and reads only the caller's own
-- row. A request with no Trader behind it - signed out, or service_role -
-- has nothing to check, and returns before the read, which the anon role
-- has no grant for.
--
-- Storage and Realtime do not pass through PostgREST. A file a deleted
-- Trader uploads in that hour is named by no row, since naming one takes an
-- RPC, so it is litter the reapers collect (#88 for verification
-- documents).
create function public.refuse_deleted_trader()
  returns void
  language plpgsql
  stable
  set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    return;
  end if;

  if exists (
    select 1 from public.traders
    where traders.id = caller and traders.deleted_at is not null
  ) then
    raise exception 'this account has been deleted'
      using errcode = '42501';
  end if;
end;
$$;

-- Every role a request can arrive as has to be able to run it, or that
-- role's every request fails.
grant execute on function public.refuse_deleted_trader()
  to anon, authenticated, service_role;

alter role authenticator
  set pgrst.db_pre_request = 'public.refuse_deleted_trader';

notify pgrst, 'reload config';
