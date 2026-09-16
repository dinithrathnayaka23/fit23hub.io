import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { uploadsDir } from "./paths.js";

const storageDriver = String(process.env.STORAGE_DRIVER || "local").toLowerCase();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET || "fit23hub-assets";

let supabaseAdminClient;

function ensureSupabaseAdminClient() {
  if (supabaseAdminClient) return supabaseAdminClient;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  supabaseAdminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return supabaseAdminClient;
}

function sanitizeFilename(value) {
  return String(value || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildStorageObjectPath(folder, originalName) {
  const name = sanitizeFilename(originalName);
  return `${folder}/${Date.now()}-${crypto.randomUUID()}-${name}`;
}

export function shouldUseRemoteStorage() {
  return storageDriver === "supabase";
}

export async function deleteLocalTempFile(filePath) {
  if (!filePath) return;
  await fsp.unlink(filePath).catch(() => {});
}

export async function storeUploadedFile({ file, folder }) {
  if (!file) return null;

  if (!shouldUseRemoteStorage()) {
    return `/uploads/${path.basename(file.path)}`;
  }

  const client = ensureSupabaseAdminClient();
  const objectPath = buildStorageObjectPath(folder, file.originalname);
  const contentType = file.mimetype || "application/octet-stream";
  const stream = fs.createReadStream(file.path);

  const { error } = await client.storage.from(supabaseBucket).upload(objectPath, stream, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data } = client.storage.from(supabaseBucket).getPublicUrl(objectPath);
  await deleteLocalTempFile(file.path);
  return data.publicUrl;
}

/** Stores already-processed bytes, such as a re-encoded avatar, under a random name. */
export async function storeBuffer({ buffer, folder, extension, contentType }) {
  const name = `${Date.now()}-${crypto.randomUUID()}.${extension}`;

  if (!shouldUseRemoteStorage()) {
    await fsp.mkdir(uploadsDir, { recursive: true });
    await fsp.writeFile(path.join(uploadsDir, name), buffer);
    return `/uploads/${name}`;
  }

  const client = ensureSupabaseAdminClient();
  const objectPath = `${folder}/${name}`;
  const { error } = await client.storage.from(supabaseBucket).upload(objectPath, buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  return client.storage.from(supabaseBucket).getPublicUrl(objectPath).data.publicUrl;
}

/**
 * Best-effort removal of a file this app stored. URLs it does not recognise as
 * its own are ignored, so a stale or external value can never delete anything
 * outside the uploads directory or the configured bucket.
 */
export async function deleteStoredFile(url) {
  if (!url) return;

  try {
    if (url.startsWith("/uploads/")) {
      const name = path.basename(url);
      if (name && name === url.slice("/uploads/".length)) {
        await fsp.unlink(path.join(uploadsDir, name)).catch(() => {});
      }
      return;
    }

    if (!shouldUseRemoteStorage() || !supabaseUrl) return;

    const marker = `/storage/v1/object/public/${supabaseBucket}/`;
    const index = url.indexOf(marker);
    if (!url.startsWith(supabaseUrl) || index === -1) return;

    const objectPath = decodeURIComponent(url.slice(index + marker.length));
    if (objectPath.includes("..")) return;

    await ensureSupabaseAdminClient().storage.from(supabaseBucket).remove([objectPath]);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[storage] Could not delete previous file:", error?.message || error);
  }
}
