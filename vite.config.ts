import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vitest configuration options
    environment: "node",
    globals: true, // allows using expect, describe, etc. without importing them
    include: ["./tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
  },
});
