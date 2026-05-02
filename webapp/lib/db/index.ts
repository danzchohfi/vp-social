import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

type Db = ReturnType<typeof drizzle<typeof schema>>

let _db: Db | null = null
function getDb(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error("DATABASE_URL is not set")
    _db = drizzle(neon(url), { schema })
  }
  return _db
}

// Proxy so existing `db.select(...)` call sites keep working,
// but the Neon client is only constructed on first use (not at import time).
// This keeps `next build`'s "Collecting page data" step from crashing
// when DATABASE_URL isn't present in the build environment.
export const db = new Proxy({} as Db, {
  get(_t, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver)
  },
})
