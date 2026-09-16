import sharp from "sharp";

export const AVATAR_MAX_BYTES = 15 * 1024 * 1024;
export const AVATAR_OUTPUT_SIZE = 512;
const MIN_SIDE = 128;
// Comfortably above a 108 MP flagship sensor, far below a decompression bomb.
const MAX_INPUT_PIXELS = 120_000_000;
const MAX_ASPECT_RATIO = 4;

// Decided from the decoded bytes, never from the client-supplied mimetype or
// filename. SVG is deliberately absent: it can carry script and would be served
// back from our own origin.
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "heif", "gif"]);

// ISO-BMFF "brand" codes that mark a file as HEIC/HEIF-with-HEVC, as opposed to
// AVIF (also a "heif" container as far as libvips is concerned, but coded with
// AV1 instead of HEVC). The distinction matters because sharp's official
// prebuilt binaries link libheif against libaom for AV1 only - HEVC decoding is
// left out over patent licensing, so a real iPhone photo fails to decode even
// though libvips happily recognises the container.
const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs", "mif1", "msf1"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);

/**
 * Sniffs the ISO-BMFF `ftyp` box - the first bytes of any HEIC, HEIF or AVIF
 * file - to tell an undecodable HEVC-coded HEIC apart from every other reason
 * sharp might fail to read a file, without needing sharp to succeed first.
 * Returns false for anything that is not a brand-recognisable HEIC container,
 * including valid AVIF (which this build of sharp can actually decode).
 */
function looksLikeUndecodableHeic(buffer) {
  if (buffer.length < 12 || buffer.toString("ascii", 4, 8) !== "ftyp") return false;

  const boxSize = buffer.readUInt32BE(0);
  const end = Math.min(buffer.length, boxSize > 0 ? boxSize : buffer.length);
  const brands = [];
  for (let offset = 8; offset + 4 <= end; offset += 4) {
    brands.push(buffer.toString("ascii", offset, offset + 4).toLowerCase());
  }

  if (brands.some((brand) => AVIF_BRANDS.has(brand))) return false;
  return brands.some((brand) => HEIC_BRANDS.has(brand));
}

export class ImageValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ImageValidationError";
    this.status = status;
  }
}

/**
 * Validates an uploaded avatar and re-encodes it into a small square WebP.
 *
 * Re-encoding from decoded pixels is what strips EXIF, including GPS
 * coordinates from phone cameras: sharp writes no metadata unless asked to.
 * rotate() runs first so the EXIF orientation flag is applied to the pixels
 * before it is thrown away, otherwise portrait phone shots come out sideways.
 */
export async function processAvatar(buffer) {
  if (!buffer?.length) {
    throw new ImageValidationError("The uploaded file is empty.");
  }

  let metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    if (looksLikeUndecodableHeic(buffer)) {
      throw new ImageValidationError(
        "iPhone HEIC photos aren't supported yet. In Settings, go to Camera > Formats and choose "
          + '"Most Compatible" so new photos save as JPEG, or use "Convert to JPEG" when sharing this one.',
      );
    }
    throw new ImageValidationError("That file is not an image we can read. Upload a JPEG, PNG or WebP photo.");
  }

  if (!ALLOWED_FORMATS.has(metadata.format)) {
    throw new ImageValidationError("Unsupported image type. Upload a JPEG, PNG or WebP photo.", 415);
  }

  const { width = 0, height = 0 } = metadata;
  // Orientations 5-8 are rotated 90 degrees, so the stored width and height swap.
  const rotated = (metadata.orientation ?? 1) >= 5;
  const displayWidth = rotated ? height : width;
  const displayHeight = rotated ? width : height;

  if (displayWidth * displayHeight > MAX_INPUT_PIXELS) {
    throw new ImageValidationError("That image has too many pixels to process.", 413);
  }

  if (Math.min(displayWidth, displayHeight) < MIN_SIDE) {
    throw new ImageValidationError(`The image is too small. Use one at least ${MIN_SIDE}×${MIN_SIDE} pixels.`);
  }

  const ratio = Math.max(displayWidth, displayHeight) / Math.min(displayWidth, displayHeight);
  if (ratio > MAX_ASPECT_RATIO) {
    throw new ImageValidationError("That image is too long and narrow for a profile picture. Crop it closer to a square.");
  }

  let output;
  try {
    output = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, pages: 1 })
      .rotate()
      .resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    if (looksLikeUndecodableHeic(buffer)) {
      throw new ImageValidationError(
        "iPhone HEIC photos aren't supported yet. In Settings, go to Camera > Formats and choose "
          + '"Most Compatible" so new photos save as JPEG, or use "Convert to JPEG" when sharing this one.',
      );
    }
    throw new ImageValidationError("We could not process that image. Save it as a JPEG or PNG and try again.");
  }

  return {
    buffer: output.data,
    contentType: "image/webp",
    extension: "webp",
    width: output.info.width,
    height: output.info.height,
    originalFormat: metadata.format,
    originalWidth: displayWidth,
    originalHeight: displayHeight,
  };
}
