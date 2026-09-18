import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The suite drives a real server against a real database, so tests inside a
    // file must run in order and files must not race each other over shared
    // rows (the super admin, the seeded tombstone account).
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    setupFiles: ["tests/setup.mjs"],
    include: ["tests/**/*.test.mjs"],
    reporters: ["verbose"],
  },
});
