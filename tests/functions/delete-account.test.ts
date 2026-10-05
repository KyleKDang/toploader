import { describe, expect, inject, it } from 'vitest';
import { FOR_GOOD } from '../../supabase/functions/_shared/ban-trader.ts';
import { deleteAccount } from '../../supabase/functions/_shared/delete-account.ts';
import { makeFounder } from '../db/arrange.ts';
import {
  seedTrader,
  serviceClient,
  submitVerification,
  uploadVerificationDocuments,
  VERIFICATION_DOCUMENTS_BUCKET,
  type SeededTrader,
  type VerificationDocuments,
} from '../db/seed.ts';

/*
 * Seam 2: the `delete_account` edge function, run against the local stack
 * in-process the way the function runs it. Nothing here is faked: the side
 * effects that leave the database are Auth and Storage, and both are the
 * local stack's own.
 *
 * This file is the function's own steps: whose account a request names,
 * the verification documents it deletes from Storage, and that an account
 * the database will refuse loses nothing on the way to being refused. What
 * the deletion then does to the database is the erasure trigger's, proven
 * at seam 1 (tests/db/account-deletion.test.ts).
 */

const options = () => ({
  supabaseUrl: inject('supabaseUrl'),
  supabaseSecretKey: inject('supabaseSecretKey'),
});

/** Deletes the account a client is signed in to, as the edge function does. */
async function deleteAccountOf(trader: Pick<SeededTrader, 'client'>) {
  const { data } = await trader.client.auth.getSession();
  return deleteAccount({
    ...options(),
    accessToken: data.session?.access_token ?? null,
  });
}

async function hasAccount(traderId: string) {
  const { data } = await serviceClient().auth.admin.getUserById(traderId);
  return data.user !== null;
}

/** Whether each of a request's two documents is still in Storage. */
async function areStored(documents: VerificationDocuments) {
  return Promise.all(
    [documents.id_document_path, documents.selfie_path].map(async (path) => {
      const { error } = await serviceClient()
        .storage.from(VERIFICATION_DOCUMENTS_BUCKET)
        .download(path);
      return error === null;
    }),
  );
}

describe('The delete_account function', { timeout: 60_000 }, () => {
  it('deletes the account of the session it is called with, and nobody else’s', async () => {
    const [actor, foreign] = await Promise.all([
      seedTrader('Actor'),
      seedTrader('Foreign'),
    ]);

    expect(await deleteAccountOf(actor)).toBe('deleted');

    expect(await hasAccount(actor.id)).toBe(false);
    expect(await hasAccount(foreign.id)).toBe(true);
    // The session is refused from here on, which is the erasure having run.
    const { error } = await actor.client.from('cities').select('id');
    expect(error?.message).toBe('this account has been deleted');
  });

  it('deletes the Trader’s verification documents from Storage, submitted or not, and no other Trader’s', async () => {
    const [actor, foreign] = await Promise.all([
      seedTrader('Actor'),
      seedTrader('Foreign'),
    ]);
    const submitted = await submitVerification(actor);
    const abandoned = await uploadVerificationDocuments(actor);
    const theirs = await submitVerification(foreign);

    await deleteAccountOf(actor);

    expect(await areStored(submitted)).toEqual([false, false]);
    expect(await areStored(abandoned)).toEqual([false, false]);
    expect(await areStored(theirs)).toEqual([true, true]);
  });

  it('deletes nobody when signed out, or with a token that is not a session', async () => {
    const actor = await seedTrader('Actor');

    expect(await deleteAccount({ ...options(), accessToken: null })).toBe(
      'signed_out',
    );
    expect(
      await deleteAccount({ ...options(), accessToken: 'not-a-session' }),
    ).toBe('signed_out');
    // The publishable key is a token every visitor holds.
    expect(
      await deleteAccount({
        ...options(),
        accessToken: inject('supabasePublishableKey'),
      }),
    ).toBe('signed_out');
    expect(await hasAccount(actor.id)).toBe(true);
  });

  it('has nothing to delete the second time: the session went with the account', async () => {
    const actor = await seedTrader('Actor');
    await deleteAccountOf(actor);

    expect(await deleteAccountOf(actor)).toBe('signed_out');
  });

  it('refuses a Founder, and leaves their verification documents where they are', async () => {
    const actor = await seedTrader('Actor');
    const documents = await submitVerification(actor);
    await makeFounder(actor.id);

    expect(await deleteAccountOf(actor)).toBe('refused');

    expect(await hasAccount(actor.id)).toBe(true);
    expect(await areStored(documents)).toEqual([true, true]);
  });

  it('deletes nothing for a banned Trader, whose session Auth no longer honors', async () => {
    const actor = await seedTrader('Actor');
    const documents = await submitVerification(actor);
    // The session is still in hand, but Auth refuses it from the ban on.
    // The database refuses the account too (require_deletable_account), as
    // tests/db/account-deletion.test.ts proves for a deletion from the
    // dashboard.
    const { data } = await actor.client.auth.getSession();
    const banned = await serviceClient().auth.admin.updateUserById(actor.id, {
      ban_duration: FOR_GOOD,
    });
    if (banned.error) throw banned.error;

    expect(
      await deleteAccount({
        ...options(),
        accessToken: data.session?.access_token ?? null,
      }),
    ).toBe('signed_out');

    expect(await hasAccount(actor.id)).toBe(true);
    expect(await areStored(documents)).toEqual([true, true]);
  });
});
