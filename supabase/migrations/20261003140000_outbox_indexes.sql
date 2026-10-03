-- The outbox, indexed for the two ways it is read besides the claim (#101).
--
-- public.notifications kept every row it was ever given and was indexed
-- only for the claim, so anything that looked a row up another way read the
-- whole table. On a local stack of 1.94M rows that was every account
-- deletion and every read of a topic's rows.

-- A Trader's rows. Deleting an account deletes them by trader_id, in
-- erase_trader_for_deleted_account and in the cascade from
-- notifications_trader_id_fkey, so without this each deletion read the
-- whole outbox and grew slower with every notification ever queued, anyone's.
-- Now it costs as much as the Trader's own rows.
create index notifications_trader_id_idx
  on public.notifications (trader_id);

-- A topic's rows: what happened to the notifications about one Trade or one
-- Match, as the operator and the tests ask it. text_pattern_ops so that a
-- prefix (`topic like 'trade:%'`) is answered by the index as well as an
-- exact topic is, which the database's collation would not allow a plain
-- index to do.
create index notifications_topic_idx
  on public.notifications (topic text_pattern_ops);
