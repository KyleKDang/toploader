/*
 * A camera-sized photo for the Listing tracer, built here rather than
 * checked in.
 *
 * It is a BMP because a BMP is a header and then the pixels, so this file
 * stays a few lines and needs no image library, and Chromium decodes one the
 * same as it decodes what a phone camera hands over. What matters to the
 * tracer is only that it arrives much larger than 1600px on its long edge
 * and with enough going on to be worth compressing: a blank image would
 * encode to nothing and prove nothing about the pipeline.
 */

const HEADER_BYTES = 14;
const DIB_BYTES = 40;

/** A portrait photo `width` by `height`, the shape a card is photographed in. */
export function cameraPhoto(width: number, height: number): Buffer {
  // BMP rows are padded out to a multiple of four bytes.
  const rowBytes = Math.ceil((width * 3) / 4) * 4;
  const pixels = Buffer.alloc(rowBytes * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = y * rowBytes + x * 3;
      // A gradient with a card-sized rectangle and some banding across it:
      // smooth enough to encode like a photograph, varied enough that the
      // encoder has something to do.
      const border = x > width / 8 && x < (width * 7) / 8;
      const band = (y >> 5) % 3 === 0 ? 40 : 0;
      pixels[at] = (x * 255) / width; // blue
      pixels[at + 1] = ((y * 255) / height + band) % 256; // green
      pixels[at + 2] = border ? 200 : 60; // red
    }
  }

  const header = Buffer.alloc(HEADER_BYTES + DIB_BYTES);
  header.write('BM', 0, 'ascii');
  header.writeUInt32LE(header.length + pixels.length, 2);
  header.writeUInt32LE(header.length, 10);
  header.writeUInt32LE(DIB_BYTES, 14);
  header.writeInt32LE(width, 18);
  // Negative height is a top-down BMP, which saves flipping the rows.
  header.writeInt32LE(-height, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(pixels.length, 34);

  return Buffer.concat([header, pixels]);
}
