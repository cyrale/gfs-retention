import { defineConfig } from "rolldown";

/**
 * Build configuration for the CLI.
 *
 * The project source uses extensionless relative imports; Rolldown resolves
 * them natively (TypeScript included), so no `.js` extension is required in the
 * source. Runtime dependencies are kept external so the bundle contains only
 * this project's code and relies on `node_modules` for its dependencies.
 */
export default defineConfig({
  input: "src/cli.ts",
  platform: "node",
  external: [
    /^node:/,
    "@aws-sdk/client-s3",
    "@date-fns/tz",
    "commander",
    "date-fns",
  ],
  output: {
    dir: "dist",
    format: "esm",
    entryFileNames: "cli.js",
    sourcemap: true,
  },
});
