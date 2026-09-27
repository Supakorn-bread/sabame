import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import webConfig from "./apps/web/eslint.config.mjs";
import { boundariesConfig } from "./scripts/eslint/workspace-boundaries.mjs";

export default defineConfig([
  globalIgnores(["**/.next/**", ".worktrees/**", ".agents/**", "**/coverage/**", "playwright-report/**", "test-results/**", "apps/*/dist/**", "apps/api/src/generated/**", "packages/*/dist/**"]),
  { files: ["apps/api/**/*.ts", "packages/**/*.ts", "e2e/**/*.ts", "playwright.config.ts"], extends: [tseslint.configs.recommended], rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] } },
  { basePath: "apps/web", extends: webConfig },
  { files: ["**/*.{ts,tsx,js,mjs}"], ...boundariesConfig },
]);
