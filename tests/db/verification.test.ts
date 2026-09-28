import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { arrange, makeFounder, verifyTrader } from './arrange.ts';
import {
  anonClient,
  seedTrader,
  serviceClient,
  TINY_WEBP,
  type Client,
  type SeededTrader,
} from './seed.ts';

/*
 * Verification: a Trader submits a photo of their government ID and a
 * selfie, a Founder looks at both and approves or rejects, and the Trader
 * becomes a Verified Trader or sends fresh ones.
 *
 * The documents are the largest avoidable liability in the app, so two
 * things are proven about them here: nobody but a Founder can read one, and
 * none outlives its review. A review is recorded only once both files are
 * gone from Storage, so there is no order of failures that leaves a
 * reviewed request with a document behind it.
 */

const BUCKET = 'verification-documents';

interface Documents {
  id_document_path: string;
  selfie_path: string;
}

/** An ID photo and a selfie, uploaded under the Trader's own prefix. */
async function uploadDocuments(trader: SeededTrader): Promise<Documents> {
  const documents = {
    id_document_path: `${trader.id}/${randomUUID()}-id.webp`,
    selfie_path: `${trader.id}/${randomUUID()}-selfie.webp`,
  };
  for (const path of Object.values(documents)) {
    const { error } = await trader.client.storage
      .from(BUCKET)
      .upload(path, TINY_WEBP, { contentType: 'image/webp' });
    if (error) throw error;
  }
  return documents;
}

/** A Trader's submitted request: its id and the documents it names. */
async function submitVerification(trader: SeededTrader) {
  const documents = await uploadDocuments(trader);
  const { data, error } = await trader.client.rpc(
    'submit_verification',
    documents,
  );
  if (error) throw error;
  return { requestId: data, ...documents };
}

/** The requests a client can see, oldest first. */
async function requestsSeenBy(client: Client) {
  const { data, error } = await client
    .from('verification_requests')
    .select('id, trader_id, status, reviewed_by, reviewed_at')
    .order('created_at');
  if (error) throw error;
  return data;
}

/** What a client gets when it asks Storage for a document. */
async function download(client: Client, path: string) {
  const { data } = await client.storage.from(BUCKET).download(path);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}

/**
 * Every file Storage holds under a Trader's prefix, read as service_role so
 * that no policy can hide one: what is asserted is what is stored.
 */
async function documentsStoredFor(trader: SeededTrader) {
  const { data, error } = await serviceClient()
    .storage.from(BUCKET)
    .list(trader.id);
  if (error) throw error;
  return data.map((file) => `${trader.id}/${file.name}`);
}

/** Deletes a request's documents, as the Founder reviewing it does. */
async function deleteDocuments(client: Client, documents: Documents) {
  return client.storage
    .from(BUCKET)
    .remove([documents.id_document_path, documents.selfie_path]);
}

/**
 * How many files Storage's own index still holds under a Trader's prefix,
 * counted past every policy and past the Storage API. With the listing
 * above it says a document is gone both ways round: no file without a row,
 * and no row without a file.
 */
async function objectRowsFor(trader: SeededTrader) {
  return arrange(async (sql) => {
    const [{ count }] = await sql<[{ count: number }]>`
      select count(*)::int as count from storage.objects
      where bucket_id = ${BUCKET} and name like ${trader.id + '/%'}`;
    return count;
  });
}

function approve(founder: SeededTrader, requestId: string) {
  return founder.client.rpc('approve_verification', { request_id: requestId });
}

function reject(founder: SeededTrader, requestId: string) {
  return founder.client.rpc('reject_verification', { request_id: requestId });
}

async function verifiedAt(client: Client, traderId: string) {
  const { data, error } = await client
    .from('traders')
    .select('verified_at')
    .eq('id', traderId)
    .single();
  if (error) throw error;
  return data.verified_at;
}

/** A Founder, the Trader asking to be verified, and a foreign Trader. */
async function seedReview() {
  const [founder, trader, foreign] = await Promise.all([
    seedTrader('Founder'),
    seedTrader('Trader'),
    seedTrader('Foreign'),
  ]);
  await makeFounder(founder.id);
  return { founder, trader, foreign };
}

describe('Verification', () => {
  describe('a submission', () => {
    it('waits on review, where its Trader and a Founder can see it', async () => {
      const { founder, trader } = await seedReview();

      const { requestId } = await submitVerification(trader);

      const pending = {
        id: requestId,
        trader_id: trader.id,
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
      };
      expect(await requestsSeenBy(trader.client)).toEqual([pending]);
      expect(await requestsSeenBy(founder.client)).toContainEqual(pending);
      expect(await verifiedAt(trader.client, trader.id)).toBeNull();
    });

    it('lands its documents where only a Founder can read them', async () => {
      const { founder, trader, foreign } = await seedReview();

      const documents = await submitVerification(trader);

      for (const path of [documents.id_document_path, documents.selfie_path]) {
        expect(await download(founder.client, path)).toEqual(TINY_WEBP);
        expect(await download(foreign.client, path)).toBeNull();
        expect(await download(anonClient(), path)).toBeNull();
        // Not even the Trader who sent it: what a Founder reviews is what
        // was sent, and a session left signed in shows nobody an ID.
        expect(await download(trader.client, path)).toBeNull();
      }
    });

    it('cannot be seen by a foreign Trader, nor its documents found', async () => {
      const { trader, foreign } = await seedReview();
      const documents = await submitVerification(trader);

      expect(await requestsSeenBy(foreign.client)).toEqual([]);
      for (const client of [foreign.client, trader.client, anonClient()]) {
        const { data } = await client.storage.from(BUCKET).list(trader.id);
        expect(data ?? []).toEqual([]);

        const { data: link } = await client.storage
          .from(BUCKET)
          .createSignedUrl(documents.id_document_path, 60);
        expect(link).toBeNull();
      }
    });

    it('cannot be read by a signed-out visitor', async () => {
      const { trader } = await seedReview();
      await submitVerification(trader);

      const { data, error } = await anonClient()
        .from('verification_requests')
        .select('id');

      expect(data).toBeNull();
      expect(error?.code).toBe('42501');
    });

    it('keeps its documents as they were sent: no Trader replaces or deletes one', async () => {
      const { trader, foreign } = await seedReview();
      const documents = await submitVerification(trader);

      for (const client of [trader.client, foreign.client]) {
        const { error } = await client.storage
          .from(BUCKET)
          .upload(documents.selfie_path, TINY_WEBP, {
            contentType: 'image/webp',
            upsert: true,
          });
        expect(error).not.toBeNull();
        await deleteDocuments(client, documents);
      }

      expect((await documentsStoredFor(trader)).sort()).toEqual(
        [documents.id_document_path, documents.selfie_path].sort(),
      );
    });

    it('takes only documents its own Trader uploaded', async () => {
      const { trader, foreign } = await seedReview();
      const theirs = await uploadDocuments(trader);

      const { error: uploadError } = await foreign.client.storage
        .from(BUCKET)
        .upload(`${trader.id}/${randomUUID()}.webp`, TINY_WEBP, {
          contentType: 'image/webp',
        });
      const { error: submitError } = await foreign.client.rpc(
        'submit_verification',
        theirs,
      );

      expect(uploadError).not.toBeNull();
      expect(submitError).toMatchObject({
        code: '42501',
        message: 'a verification document must be one the Trader uploaded',
      });
      expect(await requestsSeenBy(foreign.client)).toEqual([]);
    });

    it('is refused for a signed-out visitor', async () => {
      const { trader } = await seedReview();
      const documents = await uploadDocuments(trader);

      const { error } = await anonClient().rpc(
        'submit_verification',
        documents,
      );

      expect(error?.code).toBe('42501');
    });

    it('needs both documents to be in Storage, and to be two documents', async () => {
      const { trader } = await seedReview();
      const documents = await uploadDocuments(trader);

      const neverUploaded = await trader.client.rpc('submit_verification', {
        ...documents,
        selfie_path: `${trader.id}/${randomUUID()}-selfie.webp`,
      });
      const oneFileTwice = await trader.client.rpc('submit_verification', {
        ...documents,
        selfie_path: documents.id_document_path,
      });

      expect(neverUploaded.error).toMatchObject({
        code: '22023',
        message:
          'a verification document must be uploaded before it is submitted',
      });
      expect(oneFileTwice.error).toMatchObject({
        code: '22023',
        message: 'verification needs an ID photo and a selfie',
      });
      expect(await requestsSeenBy(trader.client)).toEqual([]);
    });

    it('is refused while an earlier one waits on review', async () => {
      const { trader } = await seedReview();
      const { requestId } = await submitVerification(trader);

      const { error } = await trader.client.rpc(
        'submit_verification',
        await uploadDocuments(trader),
      );

      expect(error).toMatchObject({
        code: '22023',
        message: 'a verification request is already waiting on review',
      });
      expect(await requestsSeenBy(trader.client)).toMatchObject([
        { id: requestId },
      ]);
    });

    it('is refused for a Verified Trader', async () => {
      const { trader } = await seedReview();
      await verifyTrader(trader.id);

      const { error } = await trader.client.rpc(
        'submit_verification',
        await uploadDocuments(trader),
      );

      expect(error).toMatchObject({
        code: '22023',
        message: 'a Verified Trader has nothing left to verify',
      });
    });

    it('accepts only a small WebP', async () => {
      const { trader } = await seedReview();
      const bucket = trader.client.storage.from(BUCKET);

      const notWebp = await bucket.upload(
        `${trader.id}/${randomUUID()}.pdf`,
        Buffer.from('%PDF-1.7'),
        { contentType: 'application/pdf' },
      );
      const tooLarge = await bucket.upload(
        `${trader.id}/${randomUUID()}.webp`,
        Buffer.alloc(524_289),
        { contentType: 'image/webp' },
      );

      expect(notWebp.error).not.toBeNull();
      expect(tooLarge.error).not.toBeNull();
      expect(await documentsStoredFor(trader)).toEqual([]);
    });
  });

  describe('an approval', () => {
    it('makes the Trader a Verified Trader, and leaves no document in Storage', async () => {
      const { founder, trader } = await seedReview();
      const { requestId, ...documents } = await submitVerification(trader);
      const before = Date.now();

      await deleteDocuments(founder.client, documents);
      const { error } = await approve(founder, requestId);

      expect(error).toBeNull();
      expect(await documentsStoredFor(trader)).toEqual([]);
      expect(await objectRowsFor(trader)).toBe(0);
      for (const path of Object.values(documents)) {
        expect(await download(founder.client, path)).toBeNull();
      }
      const verified = await verifiedAt(trader.client, trader.id);
      expect(Date.parse(verified ?? '')).toBeGreaterThanOrEqual(before - 1000);
      expect(await requestsSeenBy(trader.client)).toEqual([
        {
          id: requestId,
          trader_id: trader.id,
          status: 'approved',
          reviewed_by: founder.id,
          reviewed_at: expect.any(String) as string,
        },
      ]);
    });

    it('is refused while either document is still in Storage', async () => {
      const { founder, trader } = await seedReview();
      const { requestId, ...documents } = await submitVerification(trader);

      const withBoth = await approve(founder, requestId);
      await founder.client.storage
        .from(BUCKET)
        .remove([documents.id_document_path]);
      const withTheSelfie = await approve(founder, requestId);

      for (const { error } of [withBoth, withTheSelfie]) {
        expect(error).toMatchObject({
          code: '55000',
          message:
            'a verification request is reviewed once its documents are deleted',
        });
      }
      expect(await verifiedAt(trader.client, trader.id)).toBeNull();
      expect(await requestsSeenBy(trader.client)).toMatchObject([
        { status: 'pending' },
      ]);
    });

    it("is refused for a Founder's own request", async () => {
      const { founder, trader: otherFounder } = await seedReview();
      await makeFounder(otherFounder.id);
      const { requestId, ...documents } = await submitVerification(founder);
      await deleteDocuments(otherFounder.client, documents);

      const own = await approve(founder, requestId);

      expect(own.error).toMatchObject({
        code: '42501',
        message: 'a Founder cannot review their own verification request',
      });
      expect(await verifiedAt(founder.client, founder.id)).toBeNull();

      // The other Founder's to approve, which is why there are two.
      expect((await approve(otherFounder, requestId)).error).toBeNull();
      expect(await verifiedAt(founder.client, founder.id)).not.toBeNull();
    });

    it('is refused for a Trader who is not a Founder, their own request included', async () => {
      const { founder, trader, foreign } = await seedReview();
      const { requestId, ...documents } = await submitVerification(trader);
      await deleteDocuments(founder.client, documents);

      for (const client of [foreign.client, trader.client, anonClient()]) {
        const { error } = await client.rpc('approve_verification', {
          request_id: requestId,
        });

        expect(error?.code).toBe('42501');
      }
      expect(await verifiedAt(trader.client, trader.id)).toBeNull();
    });

    it('tells a Trader who is not a Founder nothing about which requests exist', async () => {
      const { trader, foreign } = await seedReview();
      const { requestId } = await submitVerification(trader);

      const real = await approve(foreign, requestId);
      const madeUp = await approve(foreign, randomUUID());

      expect(real.error).toMatchObject({ code: '42501' });
      expect(madeUp.error).toEqual(real.error);
    });

    it('is refused for a request that is not there, or is already reviewed', async () => {
      const { founder, trader } = await seedReview();
      const { requestId, ...documents } = await submitVerification(trader);
      await deleteDocuments(founder.client, documents);
      await reject(founder, requestId);

      const missing = await approve(founder, randomUUID());
      const reviewed = await approve(founder, requestId);

      expect(missing.error).toMatchObject({
        code: 'P0002',
        message: 'no such verification request',
      });
      expect(reviewed.error).toMatchObject({
        code: '55000',
        message: 'this verification request has already been reviewed',
      });
      expect(await verifiedAt(trader.client, trader.id)).toBeNull();
    });
  });

  describe('a rejection', () => {
    it('leaves the Trader unverified, and no document in Storage', async () => {
      const { founder, trader } = await seedReview();
      const { requestId, ...documents } = await submitVerification(trader);

      await deleteDocuments(founder.client, documents);
      const { error } = await reject(founder, requestId);

      expect(error).toBeNull();
      expect(await documentsStoredFor(trader)).toEqual([]);
      expect(await objectRowsFor(trader)).toBe(0);
      expect(await verifiedAt(trader.client, trader.id)).toBeNull();
      expect(await requestsSeenBy(trader.client)).toEqual([
        {
          id: requestId,
          trader_id: trader.id,
          status: 'rejected',
          reviewed_by: founder.id,
          reviewed_at: expect.any(String) as string,
        },
      ]);
    });

    it('is refused while either document is still in Storage', async () => {
      const { founder, trader } = await seedReview();
      const { requestId, ...documents } = await submitVerification(trader);

      const withBoth = await reject(founder, requestId);
      await founder.client.storage.from(BUCKET).remove([documents.selfie_path]);
      const withTheId = await reject(founder, requestId);

      for (const { error } of [withBoth, withTheId]) {
        expect(error).toMatchObject({
          code: '55000',
          message:
            'a verification request is reviewed once its documents are deleted',
        });
      }
      expect(await requestsSeenBy(trader.client)).toMatchObject([
        { status: 'pending' },
      ]);
    });

    it('lets the Trader submit fresh documents, which can be approved', async () => {
      const { founder, trader } = await seedReview();
      const first = await submitVerification(trader);
      await deleteDocuments(founder.client, first);
      await reject(founder, first.requestId);

      const second = await submitVerification(trader);
      await deleteDocuments(founder.client, second);
      const { error } = await approve(founder, second.requestId);

      expect(error).toBeNull();
      expect(await requestsSeenBy(trader.client)).toMatchObject([
        { id: first.requestId, status: 'rejected' },
        { id: second.requestId, status: 'approved' },
      ]);
      expect(await verifiedAt(trader.client, trader.id)).not.toBeNull();
      expect(await documentsStoredFor(trader)).toEqual([]);
    });

    it('is refused for a Trader who is not a Founder, and for a Founder on their own request', async () => {
      const { founder, trader, foreign } = await seedReview();
      const theirs = await submitVerification(trader);
      const own = await submitVerification(founder);

      for (const client of [foreign.client, trader.client, anonClient()]) {
        const { error } = await client.rpc('reject_verification', {
          request_id: theirs.requestId,
        });

        expect(error?.code).toBe('42501');
      }
      expect((await reject(founder, own.requestId)).error).toMatchObject({
        code: '42501',
        message: 'a Founder cannot review their own verification request',
      });
      expect(await requestsSeenBy(trader.client)).toMatchObject([
        { status: 'pending' },
      ]);
    });
  });
});
