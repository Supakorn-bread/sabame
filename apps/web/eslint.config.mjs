import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import { boundariesConfig } from "../../scripts/eslint/workspace-boundaries.mjs";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  { settings: { next: { rootDir: import.meta.dirname } } },
  boundariesConfig,
  globalIgnores([".next/**", "coverage/**"]),
]);
