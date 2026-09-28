import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useNavigate, useRouter } from '@tanstack/react-router';
import {
  AppShell,
  Button,
  EmptyState,
  FormError,
  Sheet,
  TopBar,
} from '../components';
import { formatMoment } from '../lib/format';
import {
  PENDING_VERIFICATION_KEY,
  reviewVerification,
  verificationDocumentQuery,
  type VerificationAnswer,
} from '../lib/queries';
import { traderName } from '../lib/trades';
import { useTabs } from '../lib/tabs';

/*
 * Reviewing one verification request: the Founder looks at the ID and the
 * selfie, and approves or rejects.
 *
 * Either answer deletes both photos before it is recorded, and neither can
 * be taken back: an approval has no undo, and a rejected Trader's photos are
 * gone. So each is confirmed in a sheet that says what it is about to do.
 *
 * The photos are shown whole and at the full width of the column, never
 * cropped to a tile: what is being judged is the text of an ID and a face.
 */

const route = getRouteApi('/admin/verification/$requestId');

export function ReviewScreen() {
  const { request } = route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const tabs = useTabs('profile');
  const [confirming, setConfirming] = useState<VerificationAnswer | null>(null);

  const backToQueue = () => void navigate({ to: '/admin/verification' });

  const review = useMutation({
    mutationFn: async (answer: VerificationAnswer) => {
      if (!request) throw new Error('There is no request to review.');
      await reviewVerification(request, answer);
    },
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: PENDING_VERIFICATION_KEY });
      await router.invalidate();
      backToQueue();
    },
  });

  const header = <TopBar title="Review request" onBack={backToQueue} />;

  if (!request) {
    return (
      <AppShell header={header} {...tabs}>
        <EmptyState
          className="min-h-full"
          title="This request is not waiting on review"
          hint="It may have been reviewed already."
          action={{ label: 'Back to requests', onClick: backToQueue }}
        />
      </AppShell>
    );
  }

  const name = traderName(request.trader);

  return (
    <AppShell
      header={
        <TopBar
          title="Review request"
          subtitle={`${name} · Sent ${formatMoment(request.created_at)}`}
          onBack={backToQueue}
        />
      }
      {...tabs}
    >
      <div className="flex flex-col gap-4 px-4 py-4">
        <p className="text-sm leading-prose text-muted">
          Check that the ID is a real government ID, that it shows an adult, and
          that the selfie is the person on it.
        </p>

        <Document
          title="ID photo"
          alt={`ID photo from ${name}`}
          path={request.id_document_path}
        />
        <Document
          title="Selfie"
          alt={`Selfie from ${name}`}
          path={request.selfie_path}
        />

        <div className="flex gap-2">
          <Button onClick={() => setConfirming('reject')}>Reject</Button>
          <Button variant="primary" onClick={() => setConfirming('approve')}>
            Approve
          </Button>
        </div>
      </div>

      <Sheet
        open={confirming !== null}
        title={
          confirming === 'reject'
            ? `Reject ${name}'s request?`
            : `Approve ${name}?`
        }
        onClose={() => setConfirming(null)}
        actions={
          <>
            <Button onClick={() => setConfirming(null)}>Go back</Button>
            <Button
              variant="primary"
              disabled={review.isPending}
              onClick={() => {
                if (confirming) review.mutate(confirming);
              }}
            >
              {confirming === 'reject' ? 'Reject' : 'Approve'}
            </Button>
          </>
        }
      >
        <p className="text-base leading-prose text-ink">
          {confirming === 'reject'
            ? 'Both photos are deleted, and they are asked to send new ones. This cannot be undone.'
            : 'They become a verified trader, and both photos are deleted. This cannot be undone.'}
        </p>
        <FormError error={review.error} />
      </Sheet>
    </AppShell>
  );
}

/**
 * One document, fetched as bytes and shown from memory, so the photo has no
 * address anyone else could open.
 */
function Document({
  title,
  alt,
  path,
}: {
  title: string;
  alt: string;
  path: string;
}) {
  const document = useQuery(verificationDocumentQuery(path));

  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {document.data ? (
        <img
          src={document.data}
          alt={alt}
          className="w-full rounded-sm border border-line bg-surface-2"
        />
      ) : (
        <p className="rounded-sm border border-line bg-surface-2 p-4 text-sm leading-prose text-muted">
          {document.isPending
            ? 'Loading…'
            : document.isError
              ? 'This photo could not be loaded. Check your connection, then open the request again.'
              : 'This photo is no longer in storage. If you did not see it, reject the request so they send a new one.'}
        </p>
      )}
    </section>
  );
}
