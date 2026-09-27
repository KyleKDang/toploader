-- A Meetup put forward is told to the Trader it waits on (#74), a row the
-- notification matrix gained after its kinds were declared. It is added in
-- a migration of its own because Postgres will not let a transaction use an
-- enum value added in that same transaction; the next migration uses it.
alter type public.notification_kind add value 'meetup_proposed'
  after 'proposal_countered';
