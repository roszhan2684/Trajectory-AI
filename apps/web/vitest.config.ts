import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60000,
    // keep test writes inside the project, never touching the dev store
    env: {
      TRAJECTORY_DATA_DIR: path.resolve(import.meta.dirname, "../../.cache/test-data"),
      DEMO_STEP_DELAY_MS: "0",
    },
  },
});
