import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateId() {
  return crypto.randomUUID()
}

/** Extrai apenas o primeiro nome de um nome completo. Usado em
 * mensagens diretas pro cliente (wa.me, template WhatsApp) onde
 * "Olá Daniel" é mais natural que "Olá Daniel Zollinger Chohfi".
 * Audit comments e emails pra agency mantêm nome completo (formal).
 *
 * Retorna empty string se input é null/empty. Split em qualquer whitespace,
 * pega o primeiro token. "Daniel Zollinger Chohfi" → "Daniel".
 * "  Daniel  " → "Daniel". "" → "". */
export function firstName(fullName: string | null | undefined): string {
  if (!fullName) return ""
  const tokens = fullName.trim().split(/\s+/)
  return tokens[0] ?? ""
}
