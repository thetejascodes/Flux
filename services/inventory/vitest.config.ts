import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["**/dist/**", "**/node_modules/**"],
    testTimeout: 15000,
  },
});
