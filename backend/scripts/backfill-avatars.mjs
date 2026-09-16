/**
 * One-off maintenance script: reprocesses every existing profile photo through
 * the same pipeline new uploads now go through, so an avatar saved before this
 * feature shipped also gets its EXIF/GPS metadata stripped and its size capped.
 *
 * Safe to run more than once - an avatar the pipeline already produced simply
 * gets re-encoded to an equivalent WebP again, at negligible quality cost.
 *
 * Usage:
 *   node scripts/backfill-avatars.mjs           # preview only, changes nothing
 *   node scripts/backfill-avatars.mjs --yes     # actually rewrite and delete
 */
import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { prisma } from "../src/prisma.js";
import { uploadsDir } from "../src/utils/paths.js";
import { deleteStoredFile, storeBuffer } from "../src/utils/storage.js";
import { invalidateAuthUserCache } from "../src/middleware/auth.js";
import { processAvatar } from "../src/utils/image.js";

const commit = process.argv.includes("--yes");

async function readExisting(url) {
  if (url.startsWith("/uploads/")) {
    return fs.readFile(path.join(uploadsDir, path.basename(url)));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch failed: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const users = await prisma.user.findMany({
    where: { profileImageUrl: { not: null }, isSystemAccount: false },
    select: { id: true, fullName: true, profileImageUrl: true },
  });

  console.log(`Found ${users.length} account(s) with a profile photo.`);
  console.log(commit ? "Mode: LIVE - files will be rewritten and originals deleted.\n" : "Mode: DRY RUN - pass --yes to actually apply changes.\n");

  let reprocessed = 0;
  let failed = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const user of users) {
    const label = `${user.fullName} (${user.id})`;
    try {
      const original = await readExisting(user.profileImageUrl);
      const before = await import("sharp").then((s) => s.default(original).metadata());
      const hadExif = Boolean(before.exif);

      const result = await processAvatar(original);
      bytesBefore += original.length;
      bytesAfter += result.buffer.length;

      console.log(
        `  ${label}: ${before.format} ${before.width}x${before.height} `
          + `(${(original.length / 1024).toFixed(1)} KB${hadExif ? ", had EXIF" : ""}) `
          + `-> webp ${result.width}x${result.height} (${(result.buffer.length / 1024).toFixed(1)} KB)`,
      );

      if (commit) {
        const newUrl = await storeBuffer({
          buffer: result.buffer,
          folder: "profile-images",
          extension: result.extension,
          contentType: result.contentType,
        });
        await prisma.user.update({ where: { id: user.id }, data: { profileImageUrl: newUrl } });
        invalidateAuthUserCache(user.id);
        await deleteStoredFile(user.profileImageUrl);
      }

      reprocessed += 1;
    } catch (error) {
      failed += 1;
      console.log(`  ${label}: SKIPPED - ${error.message}`);
    }
  }

  console.log(
    `\n${reprocessed} reprocessed, ${failed} skipped.`
      + (reprocessed ? ` ${(bytesBefore / 1024).toFixed(0)} KB -> ${(bytesAfter / 1024).toFixed(0)} KB.` : ""),
  );
  if (!commit && reprocessed) console.log("Nothing was changed. Re-run with --yes to apply.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
