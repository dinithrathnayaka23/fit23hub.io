import path from "path";
import os from "os";
import fs from "fs";
import multer from "multer";
import { uploadsDir } from "./paths.js";
import { shouldUseRemoteStorage } from "./storage.js";

const localUploadDir = shouldUseRemoteStorage()
  ? path.join(os.tmpdir(), "fit23hub-uploads")
  : uploadsDir;

if (!fs.existsSync(localUploadDir)) {
  fs.mkdirSync(localUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function destination(_req, _file, cb) {
    cb(null, localUploadDir);
  },
  filename: function filename(_req, file, cb) {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024,
  },
});

export const uploadRecording = multer({
  storage,
  limits: {
    // Allow long lecture recordings (up to 3GB).
    fileSize: 3 * 1024 * 1024 * 1024,
  },
});
