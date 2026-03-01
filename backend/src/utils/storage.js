import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

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
