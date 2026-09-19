import { useState } from 'react';
import { cx } from '../lib/cx';

/*
 * Card tile.
 *
 * A 5:7 rectangle at --size-thumb wide, --radius-sm, with an inset hairline
 * and an inset white highlight so a pale card still reads as an object
 * against a white background. Sizes are .75x in the search picker, 1x in
 * lists, and 2x on the Card page.
 *
 * The image is hotlinked from the Catalog's upstream, so it can be missing
 * or fail to load; either way the tile stays, empty, at its size, and the
 * row or page around it does not shift.
 */

const SIZES = {
  sm: 'w-thumb-sm',
  md: 'w-thumb',
  lg: 'w-thumb-lg',
} as const;

type CardTileProps = {
  src: string | null;
  /** The Card's name, or empty where the name is already beside the tile. */
  alt: string;
  size?: keyof typeof SIZES;
  className?: string;
};

export function CardTile({ src, alt, size = 'md', className }: CardTileProps) {
  // Kept per source, so a tile reused for another Card tries its image.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src !== null && src !== failedSrc;

  return (
    <span
      className={cx(
        'relative block aspect-[5/7] shrink-0 overflow-hidden rounded-sm bg-surface-2',
        // The highlight is what makes a card image read as an object; an
        // empty tile has no object, and in dark mode the highlight alone
        // reads as a heavy frame, so it gets a plain line instead.
        !showImage && 'border border-line',
        SIZES[size],
        className,
      )}
    >
      {showImage ? (
        <>
          <img
            src={src}
            alt={alt}
            decoding="async"
            onError={() => setFailedSrc(src)}
            className="size-full object-cover"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-sm shadow-tile"
          />
        </>
      ) : null}
    </span>
  );
}
