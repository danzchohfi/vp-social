import { db } from "@/lib/db"
import { fieldMapping, instagramAccount, notionConnection } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { Client } from "@notionhq/client"
import { DEFAULT_MAPPING } from "@/lib/notion"

export type SyncResult = {
  workspaceName: string
  status: "ok" | "skipped" | "error"
  message: string
  added?: string[]
}

// Pushes the active social-account `conta` names into the Notion database's
// `accountField` Select property as options. Idempotent: existing options
// (including other clients' contas if the DB is shared) are preserved.
//
// Only works when the user's mapped accountField is type "select" — for
// rich_text/relation/etc, we report a skip with a clear message so the UI
// can nudge the user to migrate the property type.
//
// Should be called after any mutation that changes the conta set: account
// creation (pending confirm), edit conta name, toggle active, delete,
// keep-only. Best-effort — failures don't block the calling mutation.
//
// Scoped by `clientId` only — accounts and connections of an agency-scope
// client may have been created by the OWNER's userId, not the calling
// member's. Filtering on session.user.id used to silently no-op for
// members. Callers must verify clientId access before calling.
export async function syncAccountsToNotion(clientId: string): Promise<SyncResult[]> {
  const [accounts, connections] = await Promise.all([
    db
      .select()
      .from(instagramAccount)
      .where(
        and(
          eq(instagramAccount.clientId, clientId),
          eq(instagramAccount.active, true)
        )
      ),
    db
      .select()
      .from(notionConnection)
      .where(eq(notionConnection.clientId, clientId)),
  ])

  // Unique conta names, trimmed, case-preserving (Notion is case-sensitive
  // on Select options). Empty contas are dropped — they wouldn't match
  // anything anyway.
  const contas = Array.from(
    new Set(accounts.map((a) => a.conta.trim()).filter(Boolean))
  )

  const results: SyncResult[] = []

  for (const conn of connections) {
    if (!conn.databaseId) {
      results.push({
        workspaceName: conn.workspaceName,
        status: "skipped",
        message: "Nenhum banco selecionado neste workspace",
      })
      continue
    }

    const [m] = await db
      .select()
      .from(fieldMapping)
      .where(eq(fieldMapping.connectionId, conn.id))
    const mapping = m ?? DEFAULT_MAPPING

    const notion = new Client({ auth: conn.accessToken })
    try {
      const database = (await notion.databases.retrieve({
        database_id: conn.databaseId,
      })) as any
      const prop = database.properties?.[mapping.accountField]
      if (!prop) {
        results.push({
          workspaceName: conn.workspaceName,
          status: "skipped",
          message: `Propriedade "${mapping.accountField}" não existe no banco`,
        })
        continue
      }
      if (prop.type !== "select") {
        results.push({
          workspaceName: conn.workspaceName,
          status: "skipped",
          message: `Propriedade "${mapping.accountField}" é ${prop.type}, sync só funciona com Select. Mude no Notion: ${prop.type} → Select.`,
        })
        continue
      }

      const existingOptions: Array<{ name: string; color?: string }> =
        prop.select?.options ?? []
      const existingNames = new Set(existingOptions.map((o) => o.name))
      const toAdd = contas.filter((c) => !existingNames.has(c))

      if (!toAdd.length) {
        results.push({
          workspaceName: conn.workspaceName,
          status: "ok",
          message: `Já em sincronia (${existingOptions.length} opção${existingOptions.length === 1 ? "" : "es"})`,
          added: [],
        })
        continue
      }

      // Merge — preserves existing options, only appends new ones. Notion's
      // Select is case-sensitive, so "Vitamina" and "vitamina" would coexist;
      // we treat that as the user's choice.
      const merged = [
        ...existingOptions.map((o) => ({ name: o.name, color: o.color })),
        ...toAdd.map((name) => ({ name })),
      ]

      await notion.databases.update({
        database_id: conn.databaseId,
        properties: {
          [mapping.accountField]: {
            select: { options: merged } as any,
          },
        } as any,
      })

      results.push({
        workspaceName: conn.workspaceName,
        status: "ok",
        message: `${toAdd.length} opção${toAdd.length === 1 ? "" : "ões"} adicionada${toAdd.length === 1 ? "" : "s"}`,
        added: toAdd,
      })
    } catch (e) {
      results.push({
        workspaceName: conn.workspaceName,
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return results
}

// Convenience: fire-and-forget version that swallows errors. Use from the
// account-mutation endpoints where we don't want a Notion API hiccup to fail
// the actual mutation.
export function syncAccountsToNotionAsync(clientId: string): void {
  syncAccountsToNotion(clientId).catch((e) => {
    console.warn(`[notion-account-sync] background sync failed: ${e}`)
  })
}
