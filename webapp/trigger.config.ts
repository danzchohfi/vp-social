import { defineConfig } from "@trigger.dev/sdk/v3"

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID ?? "proj_publify",
  runtime: "node",
  logLevel: "log",
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 2000,
      maxTimeoutInMs: 30000,
      factor: 2,
    },
  },
  dirs: ["./trigger"],
})
