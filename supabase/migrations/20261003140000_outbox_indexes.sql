-- The outbox, indexed for the two ways it is read besides the claim (#101).
--
-- public.notifications keeps every row it is given and was indexed only for
-- the claim, so anything that looked rows up another way read the whole
-- table, and grew slower with every notification ever queued, anyone's.

-- A Trader's rows. Deleting an account deletes them by trader_id in
-- erase_trader_for_deleted_account, which now costs as much as the Trader's
-- own rows rather than the whole outbox. (The traders row stays when an
-- account is deleted, so the cascade from notifications_trader_id_fkey is
-- not that path, though it would use this index too.)
create index notifications_trader_id_idx
  on public.notifications (trader_id);

-- A topic's rows. Nothing in the app reads the outbox by topic; this is for
-- the operator asking what happened to the notifications about one Trade or
-- one Match, and for the tests, which ask the same of the rows they queued
-- and would otherwise read the whole outbox of a long-lived local stack.
-- text_pattern_ops so that a prefix (`topic like 'trade:%'`) is answered by
-- the index as well as an exact topic is, which the database's collation
-- would not allow a plain index to do.
create index notifications_topic_idx
  on public.notifications (topic text_pattern_ops);
