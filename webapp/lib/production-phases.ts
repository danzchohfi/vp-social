/**
 * 4-fase visual aggregation of the 10-state production lifecycle for the
 * client-facing portal (/c/[token]). The dashboard side (agency) keeps
 * fine-grained status — this collapses it into 4 phases the end-client
 * actually thinks in: Planejamento → Gravação → Edição → Publicação.
 *
 * Mapping rationale:
 * - planning: tudo antes da câmera ligar (brief + roteiro + aprovação)
 * - recording: só `recording`
 * - editing: editing + delivered (entregue à agência mas ainda não foi pro ar)
 * - publishing: published
 * - archived → null (some do trilho, fora do ciclo ativo)
 */

import type { ProductionStatus } from "./productions"

export type Phase = "planning" | "recording" | "editing" | "publishing"

export const PHASES_ORDERED: Phase[] = ["planning", "recording", "editing", "publishing"]

export const PHASE_LABEL_PT: Record<Phase, string> = {
  planning: "Planejamento",
  recording: "Gravação",
  editing: "Edição",
  publishing: "Publicação",
}

export function statusToPhase(status: ProductionStatus): Phase | null {
  switch (status) {
    case "brief_pending":
    case "script_drafting":
    case "awaiting_approval":
    case "revision_requested":
    case "approved":
      return "planning"
    case "recording":
      return "recording"
    case "editing":
    case "delivered":
      return "editing"
    case "published":
      return "publishing"
    case "archived":
      return null
  }
}

export function phaseIndex(status: ProductionStatus): number {
  const p = statusToPhase(status)
  return p ? PHASES_ORDERED.indexOf(p) : -1
}
