import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { getRouteApi, useNavigate, useRouter } from '@tanstack/react-router';
import {
  AppShell,
  Badge,
  Button,
  CameraIcon,
  FormError,
  ShieldIcon,
  TopBar,
} from '../components';
import { preparePhoto } from '../lib/photos';
import { submitVerification } from '../lib/queries';
import { useTabs } from '../lib/tabs';

/*
 * Getting verified: the Trader photographs their government ID and
 * themselves, and a Founder checks one against the other.
 *
 * The screen is one of four things, by where the Trader stands: the two
 * photos to take, the same with a line saying the last ones were not
 * approved, a request in review, or verified. What it says about the photos
 * is the same in all four, because it is the promise they are sent under:
 * both are deleted when they are checked, whichever way it goes.
 *
 * The photos go through the Listing photo pipeline (src/lib/photos.ts), so
 * what is stored is a WebP at most 1600px on its long edge, which keeps the
 * text of an ID readable. The pipeline's thumbnail is made and not used.
 */

const route = getRouteApi('/verification');

/** A photo the Trader has taken: what gets uploaded, and what they see now. */
type Photo = { full: Blob; previewUrl: string };

export function VerificationScreen() {
  const { traderId, trader, requests } = route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const tabs = useTabs('profile');

  const [idDocument, setIdDocument] = useState<Photo | null>(null);
  const [selfie, setSelfie] = useState<Photo | null>(null);

  // Revoked together when the screen goes, as the Listing screen's are: a
  // preview still on screen must outlive its own render.
  const previews = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const url of previews.current) URL.revokeObjectURL(url);
    },
    [],
  );

  async function take(file: File): Promise<Photo> {
    const { full } = await preparePhoto(file);
    const previewUrl = URL.createObjectURL(full);
    previews.current.push(previewUrl);
    return { full, previewUrl };
  }

  const send = useMutation({
    mutationFn: async () => {
      if (!idDocument || !selfie) throw new Error('Both photos are needed.');
      await submitVerification({
        traderId,
        idDocument: idDocument.full,
        selfie: selfie.full,
      });
    },
    // The loader reads the request just made, and the screen becomes the
    // one that says it is in review.
    onSuccess: () => router.invalidate(),
  });

  const header = (
    <TopBar title="Get verified" onBack={() => router.history.back()} />
  );
  const latest = requests.at(0);

  if (trader.verified_at !== null) {
    return (
      <AppShell header={header} {...tabs}>
        <Status
          badge={
            <Badge tone="verified" icon={<ShieldIcon />}>
              Verified
            </Badge>
          }
          title="You are verified"
          detail="A founder checked your ID and selfie, and both photos were deleted. You can send and accept trades."
        >
          <Button variant="primary" onClick={() => void navigate({ to: '/' })}>
            Go to matches
          </Button>
        </Status>
      </AppShell>
    );
  }

  if (latest?.status === 'pending') {
    return (
      <AppShell header={header} {...tabs}>
        <Status
          badge={<Badge>In review</Badge>}
          title="A founder is checking your ID and selfie"
          detail="You will get a notification and an email with the result. Both photos are deleted as soon as they are checked, whether you are approved or not."
        />
      </AppShell>
    );
  }

  return (
    <AppShell header={header} {...tabs}>
      <form
        className="flex flex-col gap-4 px-4 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          send.mutate();
        }}
      >
        {latest?.status === 'rejected' ? (
          <div
            role="status"
            className="flex flex-col gap-1 rounded-md border-2 border-line bg-surface p-4"
          >
            <p className="text-base font-bold text-ink">
              Your last photos were not approved
            </p>
            <p className="text-sm leading-prose text-muted">
              Both were deleted. Take new ones, with every word on the ID
              readable and your face clear in the selfie.
            </p>
          </div>
        ) : null}

        <p className="text-sm leading-prose text-muted">
          Only verified traders can send or accept a trade. A founder checks
          your ID against your selfie, once. Both photos are deleted as soon as
          they are checked, whether you are approved or not. What is kept is
          that you are verified, and when.
        </p>

        <PhotoField
          title="Your ID"
          hint="A driver's license, state ID, or passport. Get every corner in the photo."
          inputLabel="Take a photo of your ID"
          buttonLabel="Take ID photo"
          previewLabel="Your ID photo"
          // The rear camera, pointed at the ID on the table.
          capture="environment"
          photo={idDocument}
          take={take}
          onTaken={setIdDocument}
        />

        <PhotoField
          title="Your selfie"
          hint="Your face, looking at the camera, in good light."
          inputLabel="Take a selfie"
          buttonLabel="Take selfie"
          previewLabel="Your selfie"
          capture="user"
          photo={selfie}
          take={take}
          onTaken={setSelfie}
        />

        <FormError error={send.error} />

        <Button
          type="submit"
          variant="primary"
          disabled={!idDocument || !selfie || send.isPending}
        >
          {send.isPending ? 'Sending…' : 'Send for review'}
        </Button>
      </form>
    </AppShell>
  );
}

/** Where the Trader stands, when there is nothing for them to fill in. */
function Status({
  badge,
  title,
  detail,
  children,
}: {
  badge: React.ReactNode;
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-4">
      {badge}
      <p className="text-base font-bold text-ink">{title}</p>
      <p className="text-sm leading-prose text-muted">{detail}</p>
      {children ? <div className="mt-2 flex">{children}</div> : null}
    </div>
  );
}

type PhotoFieldProps = {
  title: string;
  hint: string;
  inputLabel: string;
  buttonLabel: string;
  previewLabel: string;
  capture: 'environment' | 'user';
  photo: Photo | null;
  take: (file: File) => Promise<Photo>;
  onTaken: (photo: Photo) => void;
};

/**
 * One photo: taken with the OS camera, shown back whole so the Trader can
 * see that it is readable, and taken again over the last one.
 */
function PhotoField({
  title,
  hint,
  inputLabel,
  buttonLabel,
  previewLabel,
  capture,
  photo,
  take,
  onTaken,
}: PhotoFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<Error | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold text-ink">{title}</p>

      {photo ? (
        <img
          src={photo.previewUrl}
          alt={previewLabel}
          className="max-h-80 w-full rounded-sm border border-line bg-surface-2 object-contain"
        />
      ) : null}

      <input
        ref={input}
        type="file"
        accept="image/*"
        capture={capture}
        aria-label={inputLabel}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file twice in a row still fires.
          event.target.value = '';
          if (!file) return;
          setError(null);
          take(file).then(onTaken, (failure: unknown) =>
            setError(failure instanceof Error ? failure : new Error('unknown')),
          );
        }}
      />
      <Button icon={<CameraIcon />} onClick={() => input.current?.click()}>
        {photo ? 'Take it again' : buttonLabel}
      </Button>

      <FormError error={error} />
      <p className="text-sm leading-prose text-muted">{hint}</p>
    </div>
  );
}
