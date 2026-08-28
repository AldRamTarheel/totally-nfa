import { defineConfig } from "vitest/config";
import path from "node:path";

const rootDir = import.meta.dirname;

// Unit tests only target pure functions (pnl math, analytics, candidate
// selection, staleness) — no DB/network/Gemini calls in scope, so no test
// environment setup (jsdom, mocks, etc.) is needed beyond the @/* alias
// mirroring tsconfig's path mapping.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
