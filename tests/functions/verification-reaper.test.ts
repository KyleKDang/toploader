import { beforeEach, describe, expect, inject, it } from 'vitest';
import { reapVerificationDocuments } from '../../scripts/photo-reaper/verification.ts';
import { ageUpload } from '../db/arrange.ts';
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
 * Seam 2: the photo reaper's verification pass, which deletes the verification
 * documents no waiting request names, run against the local stack.
 * Assertions are on what is left in the bucket, read as service_role through
 * the Storage API, since a file is only gone when Storage no longer serves
 * it.
 *
 * A document is uploaded before the request that names it, so a Trader who
 * walks away between the two, or whose account is deleted while the request
 * waits, leaves a government ID nobody will review (#88).
 */
describe('Verification document reaper', () => {
  const service = serviceClient();
  let trader: SeededTrader;

  const reap = () =>
    reapVerificationDocuments({
      supabaseUrl: inject('supabaseUrl'),
      supabaseSecretKey: inject('supabaseSecretKey'),
    });

  beforeEach(async () => {
    trader = await seedTrader('Verification Reaper Trader');
  });

  async function isStored(path: string) {
    const { error } = await service.storage
      .from(VERIFICATION_DOCUMENTS_BUCKET)
      .download(path);
    return error === null;
  }

  async function age(documents: VerificationDocuments, hours: number) {
    for (const path of [documents.id_document_path, documents.selfie_path]) {
      await ageUpload(path, hours, VERIFICATION_DOCUMENTS_BUCKET);
    }
  }

  // The grace period is an hour, and the Privacy Policy's promise rests on
  // it, so both sides of it are pinned close.
  it('deletes documents that were uploaded and never submitted', async () => {
    const abandoned = await uploadVerificationDocuments(trader);
    await age(abandoned, 2);

    await reap();

    expect(await isStored(abandoned.id_document_path)).toBe(false);
    expect(await isStored(abandoned.selfie_path)).toBe(false);
  });

  it('leaves an upload inside the hour alone: its request may still be coming', async () => {
    const sending = await uploadVerificationDocuments(trader);
    await age(sending, 0.5);

    await reap();

    expect(await isStored(sending.id_document_path)).toBe(true);
    expect(await isStored(sending.selfie_path)).toBe(true);
  });

  it('never deletes the documents of a waiting request, however old', async () => {
    const waiting = await submitVerification(trader);
    await age(waiting, 30 * 24);

    await reap();

    expect(await isStored(waiting.id_document_path)).toBe(true);
    expect(await isStored(waiting.selfie_path)).toBe(true);
  });

  it("deletes what a deleted account's waiting request left behind", async () => {
    const waiting = await submitVerification(trader);
    await age(waiting, 2);
    // The dashboard's path: the account and its request go, and nothing
    // deletes the files.
    const { error } = await service.auth.admin.deleteUser(trader.id);
    if (error) throw error;

    await reap();

    expect(await isStored(waiting.id_document_path)).toBe(false);
    expect(await isStored(waiting.selfie_path)).toBe(false);
  });
});
