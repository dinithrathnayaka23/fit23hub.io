export const AVATAR_MAX_BYTES = 15 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";

const TARGET_LONG_SIDE = 1024;
const SKIP_BELOW_BYTES = 400 * 1024;

export class AvatarInputError extends Error {}

/**
 * Checks a chosen photo and shrinks it in the browser before upload.
 *
 * A 12 MP phone photo is several megabytes; resizing on the device turns that
 * into a couple of hundred kilobytes on a mobile connection, and because the
 * canvas re-encode writes no metadata, GPS coordinates never leave the phone.
 * The server re-validates and re-encodes regardless, so any failure here simply
 * falls back to sending the original file.
 */
export async function prepareAvatar(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    throw new AvatarInputError("Choose a photo in JPEG, PNG or WebP format.");
  }

  const prepared = await shrink(file);

  // Checked after shrinking, so an oversized original that resizes fine is
  // still accepted.
  if (prepared.size > AVATAR_MAX_BYTES) {
    throw new AvatarInputError(`That photo is larger than ${AVATAR_MAX_BYTES / (1024 * 1024)} MB. Choose a smaller one.`);
  }

  return prepared;
}

async function shrink(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const longSide = Math.max(bitmap.width, bitmap.height);

    if (longSide <= TARGET_LONG_SIDE && file.size <= SKIP_BELOW_BYTES) return file;

    const scale = Math.min(1, TARGET_LONG_SIDE / longSide);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext("2d");
    if (!context) return file;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "avatar";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    // An undecodable file (e.g. HEIC in a browser without support) goes up as-is
    // and the server returns a specific message about it.
    return file;
  } finally {
    bitmap?.close();
  }
}
