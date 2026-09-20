import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useNavigate, useRouter } from '@tanstack/react-router';
import {
  AppShell,
  Button,
  CameraIcon,
  CardTile,
  Checkbox,
  ChipGroup,
  EmptyState,
  FormError,
  TextInput,
  TopBar,
} from '../components';
import { CONDITION_NAMES, CONDITIONS, type Condition } from '../lib/conditions';
import { preparePhoto, type PreparedPhoto } from '../lib/photos';
import { createListing } from '../lib/queries';
import { useTabs } from '../lib/tabs';

/*
 * Listing a Copy: photograph the actual card, confirm which Variant and what
 * Condition it is in, and say what you want for it.
 *
 * The photos are of the Copy in hand, which is the whole point of a Listing,
 * so the camera is the first thing on the screen and the button is disabled
 * until there is at least one. The OS camera is reached the plain way, with
 * `capture="environment"` on a file input, so the Trader gets their own
 * phone's camera rather than one we drew.
 *
 * Cash never passes through the app (ADR-0004): an asking price and the
 * open-to-offers flag are ways of saying what the Trader wants, and the hint
 * under the field says so rather than leaving it to be assumed.
 */

const route = getRouteApi('/cards/$cardId/list');

const MAX_PHOTOS = 5;

/** A photo the Trader has taken: what gets uploaded, and what they see now. */
type Photo = PreparedPhoto & { id: string; previewUrl: string };

export function NewListingScreen() {
  const { card, traderId } = route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const tabs = useTabs('search');

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [variantId, setVariantId] = useState(card?.card_variants[0]?.id);
  const [condition, setCondition] = useState<Condition>('NM');
  const [askingPrice, setAskingPrice] = useState('');
  const [openToCashOffers, setOpenToCashOffers] = useState(false);
  const [photoError, setPhotoError] = useState<Error | null>(null);

  // The object URLs are revoked together when the screen goes, rather than
  // one by one as photos come and go: a preview that is still on screen must
  // outlive its own render.
  const previews = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const url of previews.current) URL.revokeObjectURL(url);
    },
    [],
  );

  // A price the Trader typed but that is not a price is a mistake to show
  // them, not one to publish silently as no price at all.
  const priceTyped = askingPrice.trim() !== '';
  const askingPriceCents = centsFrom(askingPrice);

  const list = useMutation({
    mutationFn: async () => {
      if (!variantId) throw new Error('This card has no variants to list.');
      return createListing({
        traderId,
        cardVariantId: variantId,
        condition,
        photos,
        askingPriceCents,
        openToCashOffers,
      });
    },
    onSuccess: async (listingId) => {
      // The card page behind this one is now out of date: the Listing just
      // made belongs in its City browse. The cache has to be dropped as well
      // as the loaders, because a loader reads through ensureQueryData,
      // which hands back what the cache holds rather than refetching it.
      queryClient.removeQueries({ queryKey: ['listings'] });
      await router.invalidate();
      void navigate({ to: '/listings/$listingId', params: { listingId } });
    },
  });

  async function addPhotos(files: FileList) {
    setPhotoError(null);
    const room = MAX_PHOTOS - photos.length;
    try {
      const added = await Promise.all(
        [...files].slice(0, room).map(async (file) => {
          const prepared = await preparePhoto(file);
          const previewUrl = URL.createObjectURL(prepared.thumbnail);
          previews.current.push(previewUrl);
          return { ...prepared, id: crypto.randomUUID(), previewUrl };
        }),
      );
      setPhotos((current) => [...current, ...added]);
    } catch (error) {
      setPhotoError(error instanceof Error ? error : new Error('unknown'));
    }
  }

  const header = (
    <TopBar title="List a card" onBack={() => router.history.back()} />
  );

  if (!card) {
    return (
      <AppShell header={header} {...tabs}>
        <EmptyState
          title="That card is not in the catalog"
          hint="Go back and search for it by its name or collector number."
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
          list.mutate();
        }}
      >
        <section className="flex items-start gap-3.5">
          <CardTile src={card.image_url} alt="" />
          <div className="min-w-0">
            <h2 className="font-bold text-ink">{card.name}</h2>
            <p className="mt-0.75 text-sm text-muted">
              {card.card_sets.name} {card.number}
            </p>
          </div>
        </section>

        <PhotoPicker
          photos={photos}
          card={card.name}
          error={photoError}
          onAdd={(files) => void addPhotos(files)}
          onRemove={(id) =>
            setPhotos((current) => current.filter((photo) => photo.id !== id))
          }
        />

        {variantId !== undefined ? (
          <Field label="Variant">
            <ChipGroup
              label="Variant"
              options={card.card_variants.map(({ id, name }) => ({
                value: id,
                label: name,
              }))}
              value={variantId}
              onChange={setVariantId}
            />
          </Field>
        ) : null}

        <Field label="Condition">
          <ChipGroup
            label="Condition"
            options={CONDITIONS.map((value) => ({
              value,
              label: CONDITION_NAMES[value],
            }))}
            value={condition}
            onChange={setCondition}
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <TextInput
            label="Asking price"
            inputMode="decimal"
            placeholder="Optional"
            value={askingPrice}
            onChange={(event) => setAskingPrice(event.target.value)}
            hint="Cash is handled in person, never in the app. Leave it empty if you only want to trade."
          />
          {priceTyped && askingPriceCents === null ? (
            <p role="alert" className="text-sm font-semibold text-ink">
              That is not a price we can read. Write it in dollars, like 25 or
              25.50, or clear the field.
            </p>
          ) : null}
        </div>

        <Checkbox
          label="Open to cash offers"
          checked={openToCashOffers}
          onChange={(event) => setOpenToCashOffers(event.target.checked)}
        />

        <FormError error={list.error} />

        <Button
          type="submit"
          variant="primary"
          disabled={
            photos.length === 0 ||
            list.isPending ||
            (priceTyped && askingPriceCents === null)
          }
        >
          {list.isPending ? 'Listing…' : 'List it'}
        </Button>
      </form>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold text-ink">{label}</p>
      {children}
    </div>
  );
}

type PhotoPickerProps = {
  photos: Photo[];
  card: string;
  error: Error | null;
  onAdd: (files: FileList) => void;
  onRemove: (id: string) => void;
};

function PhotoPicker({
  photos,
  card,
  error,
  onAdd,
  onRemove,
}: PhotoPickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const full = photos.length >= MAX_PHOTOS;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold text-ink">
        Photos of your card ({photos.length} of {MAX_PHOTOS})
      </p>

      {/* A row each rather than a grid of tiles: the remove control is a
          real button with a visible edge and a 56px target, which does not
          fit over a thumbnail without covering the photo it belongs to. */}
      {photos.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {photos.map((photo, index) => (
            <li key={photo.id} className="flex items-center gap-3.5">
              <CardTile
                src={photo.previewUrl}
                alt={`${card}, photo ${index + 1}`}
              />
              <span className="grow text-base text-ink">Photo {index + 1}</span>
              <Button onClick={() => onRemove(photo.id)}>Remove</Button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={input}
        type="file"
        accept="image/*"
        // The OS camera, rear-facing, which is what photographing a card in
        // front of you means. A device with no camera falls back to its file
        // picker on its own.
        capture="environment"
        multiple
        aria-label="Add photos of your card"
        className="sr-only"
        onChange={(event) => {
          if (event.target.files) onAdd(event.target.files);
          // Cleared so picking the same file twice in a row still fires.
          event.target.value = '';
        }}
      />
      <Button
        icon={<CameraIcon />}
        disabled={full}
        onClick={() => input.current?.click()}
      >
        {photos.length === 0 ? 'Take photos' : 'Add another'}
      </Button>

      <FormError error={error} />
      <p className="text-sm leading-prose text-muted">
        Photograph the actual card you are listing, front and back. Up to five.
      </p>
    </div>
  );
}

/**
 * What the Trader typed as a price, in cents, or null where they typed
 * nothing. Anything that is not a number is treated as nothing said rather
 * than as an error: the field is optional, and a Listing without a price is
 * a Listing.
 */
function centsFrom(typed: string): number | null {
  const dollars = Number(typed.replace(/[$,\s]/g, ''));
  if (!typed.trim() || !Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}
