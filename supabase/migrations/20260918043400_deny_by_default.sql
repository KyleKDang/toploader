-- Deny by default, for every object a later migration creates. Migrations run
-- as postgres, whose default privileges would otherwise hand the client roles
-- (anon, authenticated) rights on each new table and sequence, and PUBLIC the
-- right to execute each new function, including SECURITY DEFINER RPCs.
-- After this, a migration that forgets a revoke exposes nothing: a client can
-- reach only what a migration explicitly grants.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges for role postgres
  revoke execute on functions from public;
