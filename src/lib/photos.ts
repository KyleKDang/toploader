/*
 * The upload pipeline for a Listing's photos: what the OS camera hands over
 * is a multi-megabyte JPEG, and what we store is a small WebP and a
 * thumbnail.
 *
 * The 1 GB of free Storage is what this protects (ADR-0006): at roughly
 * 230 KB for a photo and its thumbnail, it holds about 4,300 photos. Browse
 * and Matches serve the thumbnail, because full-size images in a feed are
 * what actually spends the 5 GB/month of egress.
 *
 * This is a courtesy, never the enforcement. The bucket carries its own
 * `file_size_limit` and `allowed_mime_types`, so a client that skips this
 * path still cannot fill Storage.
 */

/** The only thing the bucket accepts. */
export const PHOTO_MIME = 'image/webp';

/** Long edge of the stored photo, per the spec's upload pipeline. */
const FULL_LONG_EDGE = 1600;

/** What a full-size photo should come in under, given a reasonable photo. */
const TARGET_BYTES = 200 * 1024;

/**
 * The thumbnail the design system specifies: center-cropped to 5:7 - the
 * shape of a card - at 400px on its long edge.
 */
const THUMBNAIL_HEIGHT = 400;
const THUMBNAIL_WIDTH = Math.round(THUMBNAIL_HEIGHT * (5 / 7));

/*
 * Quality is walked down until the photo fits rather than guessed once: a
 * flat 0.8 leaves a busy holo card well over the target and a plain one well
 * under it. The floor is where a card's text starts to smear.
 */
const QUALITIES = [0.82, 0.7, 0.6, 0.5];
const THUMBNAIL_QUALITY = 0.75;

/** A photo of the Copy, ready to upload: the full-size WebP and its thumbnail. */
export type PreparedPhoto = { full: Blob; thumbnail: Blob };

/**
 * A failure a Trader can act on, carrying the same kind of `code` a Supabase
 * error does, so it reaches them through src/lib/errors.ts like every other
 * failure rather than through a message written at the throw site.
 */
function photoError(code: 'photo_unreadable' | 'photo_no_webp') {
  return Object.assign(new Error(code), { code });
}

/**
 * Re-encodes one camera photo into what the bucket stores. Throws when the
 * file is not an image the browser can decode, which is what a Trader
 * picking a PDF out of their files looks like.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  // `from-image` applies the EXIF orientation the camera recorded, so a
  // photo taken in portrait is stored the way it was taken rather than
  // sideways. Canvas drawing does not apply it on its own.
  const source = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  }).catch(() => {
    throw photoError('photo_unreadable');
  });

  try {
    return {
      full: await encodeFull(source),
      thumbnail: await encodeThumbnail(source),
    };
  } finally {
    source.close();
  }
}

/** The whole photo, uncropped, at most 1600px on its long edge. */
async function encodeFull(source: ImageBitmap): Promise<Blob> {
  // Never upscale: a small photo stays its own size rather than being
  // stretched into a bigger file that shows no more of the card.
  const scale = Math.min(
    1,
    FULL_LONG_EDGE / Math.max(source.width, source.height),
  );
  const canvas = draw(source, {
    width: Math.round(source.width * scale),
    height: Math.round(source.height * scale),
  });

  let encoded = await toWebp(canvas, QUALITIES[0]);
  for (const quality of QUALITIES.slice(1)) {
    if (encoded.size <= TARGET_BYTES) break;
    encoded = await toWebp(canvas, quality);
  }
  return encoded;
}

/** The middle of the photo, cropped to a card's 5:7. */
async function encodeThumbnail(source: ImageBitmap): Promise<Blob> {
  const scale = Math.max(
    THUMBNAIL_WIDTH / source.width,
    THUMBNAIL_HEIGHT / source.height,
  );
  const width = source.width * scale;
  const height = source.height * scale;
  const canvas = draw(source, {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    // Whatever the crop drops, it drops evenly from both sides, so the card
    // stays in the middle of the thumbnail.
    dx: (THUMBNAIL_WIDTH - width) / 2,
    dy: (THUMBNAIL_HEIGHT - height) / 2,
    dWidth: width,
    dHeight: height,
  });
  return toWebp(canvas, THUMBNAIL_QUALITY);
}

type Draw = {
  width: number;
  height: number;
  dx?: number;
  dy?: number;
  dWidth?: number;
  dHeight?: number;
};

function draw(source: ImageBitmap, { width, height, ...rest }: Draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw photoError('photo_no_webp');
  context.drawImage(
    source,
    rest.dx ?? 0,
    rest.dy ?? 0,
    rest.dWidth ?? width,
    rest.dHeight ?? height,
  );
  return canvas;
}

function toWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // A browser with no WebP encoder hands back a PNG, which the bucket
        // refuses; saying so here beats a confusing upload error.
        if (!blob || blob.type !== PHOTO_MIME) {
          reject(photoError('photo_no_webp'));
          return;
        }
        resolve(blob);
      },
      PHOTO_MIME,
      quality,
    );
  });
}
