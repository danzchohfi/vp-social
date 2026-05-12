import { describe, expect, it } from "vitest"
import { ALL_CLIENTS } from "./active-client"

describe("ALL_CLIENTS sentinel", () => {
  it("equals the documented '__all__' literal", () => {
    // External code (cookie writers in /api/clients/active-client,
    // middleware, agency-mode UI toggle) writes this string by hand
    // in places — changing the value here without grepping every
    // consumer would silently break agency-mode detection.
    expect(ALL_CLIENTS).toBe("__all__")
  })

  it("is a non-empty string (not undefined, not null)", () => {
    expect(typeof ALL_CLIENTS).toBe("string")
    expect(ALL_CLIENTS.length).toBeGreaterThan(0)
  })
})

// Note: listAccessibleClients / getActiveClient / userIsClientOwner all
// touch the database, so they're integration concerns covered by Playwright
// in tests/e2e/ (when those land). Here we just lock the public surface
// that's pure data — the sentinel + types — so a rename or accidental
// re-export typo would fail CI before it ships.
