import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { uploadsDir } from "./paths.js";

const storageDriver = String(process.env.STORAGE_DRIVER || "local").toLowerCase();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET || "fit23hub-assets";

// S3: credentials come from the default AWS chain - on EC2 that is the
// instance's IAM role, so no access keys need to live in .env.
// S3_ENDPOINT is only for S3-compatible stores (MinIO in local testing).
const s3Bucket = process.env.S3_BUCKET;
const s3Region = process.env.AWS_REGION || process.env.S3_REGION || "ap-south-1";
const s3Endpoint = process.env.S3_ENDPOINT?.replace(/\/$/, "");
// Where stored objects are read from: a CloudFront domain if one is set up,
// otherwise the bucket itself.
const s3PublicBase = (
  process.env.S3_PUBLIC_URL
  || (s3Endpoint ? `${s3Endpoint}/${s3Bucket}` : `https://${s3Bucket}.s3.${s3Region}.amazonaws.com`)
).replace(/\/$/, "");
// Uploaded names are random, so an object never changes once written.
const S3_CACHE_CONTROL = "public, max-age=604800, immutable";

let supabaseAdminClient;
let s3Client;

function ensureS3Client() {
  if (s3Client) return s3Client;
  if (!s3Bucket) {
    throw new Error("S3 storage is not configured. Set S3_BUCKET and AWS_REGION.");
  }
  s3Client = new S3Client({
    region: s3Region,
    ...(s3Endpoint ? { endpoint: s3Endpoint, forcePathStyle: true } : {}),
  });
  return s3Client;
}

const s3PublicUrl = (key) => `${s3PublicBase}/${key}`;

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
  return storageDriver === "supabase" || storageDriver === "s3";
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

  const objectPath = buildStorageObjectPath(folder, file.originalname);
  const contentType = file.mimetype || "application/octet-stream";

  if (storageDriver === "s3") {
    // Multipart and streamed, so a 3 GB recording never sits in memory.
    await new Upload({
      client: ensureS3Client(),
      params: {
        Bucket: s3Bucket,
        Key: objectPath,
        Body: fs.createReadStream(file.path),
        ContentType: contentType,
        CacheControl: S3_CACHE_CONTROL,
      },
      queueSize: 4,
      partSize: 16 * 1024 * 1024,
    }).done();
    await deleteLocalTempFile(file.path);
    return s3PublicUrl(objectPath);
  }

  const client = ensureSupabaseAdminClient();
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

  const objectPath = `${folder}/${name}`;

  if (storageDriver === "s3") {
    await ensureS3Client().send(new PutObjectCommand({
      Bucket: s3Bucket,
      Key: objectPath,
      Body: buffer,
      ContentType: contentType,
      CacheControl: S3_CACHE_CONTROL,
    }));
    return s3PublicUrl(objectPath);
  }

  const client = ensureSupabaseAdminClient();
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

    if (storageDriver === "s3") {
      const prefix = `${s3PublicBase}/`;
      if (!url.startsWith(prefix)) return;
      const key = decodeURIComponent(url.slice(prefix.length));
      if (!key || key.includes("..")) return;
      await ensureS3Client().send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: key }));
      return;
    }

    if (storageDriver !== "supabase" || !supabaseUrl) return;

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
