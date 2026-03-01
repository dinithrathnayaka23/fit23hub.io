import path from "path";
import { fileURLToPath } from "url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const backendRootDir = path.resolve(currentDir, "..", "..");
export const uploadsDir = path.join(backendRootDir, "uploads");
