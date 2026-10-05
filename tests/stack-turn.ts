import { basename } from 'node:path';
import postgres from 'postgres';

/*
 * One run of the suite at a time on the shared local stack (#114).
 *
 * Every session on this machine shares one local stack, and a run of the
 * seam-1 and seam-2 suite loads it with a worker per core. Alone, a run
 * passes; two at once slow each other's tests past Vitest's five-second
 * timeout, in whichever files happen to overlap, and the failures read as
 * bugs in the branch. So a run takes the stack's turn before its first test
 * and holds it to its last, and a second session's run waits.
 *
 * The turn is a Postgres advisory lock held by one connection of its own. A
 * run that ends any way at all, a crash included, closes that connection,
 * and Postgres hands the turn on. A watch session (`npx vitest` without
 * `run`) holds it until it exits.
 */

export type StackTurn = { release: () => Promise<void> };

const MINUTE = 60_000;

export async function takeStackTurn(
  dbUrl: string,
  {
    // Which turn: the suite's, unless a test of this module names its own.
    key = 'test run',
    // Who is taking it, shown to a run that has to wait for it. Postgres
    // keeps 63 bytes of a connection's name, so the directory's own name
    // rather than its path: a worktree's names its ticket.
    holder = `test run in ${basename(process.cwd())} (pid ${process.pid})`,
    // A run takes about a minute alone, so ten is a queue of runs or one
    // that is stuck.
    waitMs = 10 * MINUTE,
    onWait = (message: string) => console.warn(message),
  }: {
    key?: string;
    holder?: string;
    waitMs?: number;
    onWait?: (message: string) => void;
  } = {},
): Promise<StackTurn> {
  // The turn belongs to this one connection and ends when it closes, so it
  // must not be recycled mid-run, as postgres.js otherwise does after half
  // an hour or so.
  const sql = postgres(dbUrl, {
    max: 1,
    max_lifetime: null,
    connection: { application_name: holder },
  });
  const release = () => sql.end({ timeout: 0 });

  try {
    const [{ taken }] = await sql<{ taken: boolean }[]>`
      select pg_try_advisory_lock(hashtextextended(${key}, 0)) as taken`;
    if (taken) return { release };

    const minutes = Math.round(waitMs / MINUTE);
    onWait(
      `Another run holds the shared local stack: ${await holderOf(sql, key)}. ` +
        `Waiting up to ${minutes} minutes for it to finish, because two runs ` +
        'at once time out at random (#114).',
    );
    try {
      await sql`select set_config('lock_timeout', ${`${waitMs}ms`}, false)`;
      await sql`select pg_advisory_lock(hashtextextended(${key}, 0))`;
    } catch (error) {
      // 55P03, lock_not_available: the wait ran out.
      if ((error as { code?: string }).code !== '55P03') throw error;
      throw new Error(
        `Another run has held the shared local stack for ${minutes} minutes: ` +
          `${await holderOf(sql, key)}. This run did not start, because two ` +
          'runs at once time out at random (#114). Wait for that run to ' +
          'finish, or stop it if it is stuck.',
        { cause: error },
      );
    }
    return { release };
  } catch (error) {
    await release();
    throw error;
  }
}

/** The name of the connection holding the turn, as its run gave it. */
async function holderOf(sql: postgres.Sql, key: string): Promise<string> {
  // An advisory lock on one bigint shows in pg_locks as its high and low
  // halves, classid and objid, with objsubid 1.
  const [row] = await sql<{ holder: string }[]>`
    select activity.application_name as holder
      from pg_locks lock
        join pg_stat_activity activity on activity.pid = lock.pid
      where lock.locktype = 'advisory'
        and lock.granted
        and lock.objsubid = 1
        and (lock.classid::bigint << 32 | lock.objid::bigint)
          = hashtextextended(${key}, 0)`;
  return row?.holder || 'a run that has since finished';
}
