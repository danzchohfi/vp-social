import { defineConfig } from "@trigger.dev/sdk"

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID ?? "proj_lnpcdkdsqmcqxmhottgi",
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
  // 30 min upper bound. Most ticks finish in < 1 min; the long tail is
  // Story-video splitting where a 10-min source produces 10 chunks with
  // 30s pauses between IG publishes (≈ 5 min total). Without enough
  // headroom, Trigger kills the run mid-chunk and Notion status never
  // flips, causing the next tick to retry from scratch.
  maxDuration: 1800,
})
