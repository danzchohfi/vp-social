import { defineConfig } from "vitest/config"
import { resolve } from "node:path"

// Vitest config — runs unit tests against lib/*.ts pure helpers
// (no Next.js runtime, no DB). Test files match `**/*.test.ts`.
// The `@/` alias mirrors tsconfig paths so test imports look identical
// to source imports.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    // CI runs single-threaded for deterministic logging on Vercel/GitHub
    // Actions; local dev gets parallel by default.
    pool: process.env.CI ? "forks" : undefined,
  },
})
