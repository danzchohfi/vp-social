// Rate limiter in-memory por IP. Sliding window simples (Map com
// timestamps). Limitations conhecidas:
//   - Vercel Edge cria isolates separados por região: contador NÃO é
//     compartilhado. Atacante pode burlar mudando origem, mas perde
//     velocidade.
//   - Cold starts apagam o contador.
//
// Bom o suficiente pra (a) deter abuso casual, (b) cap burst em endpoint
// caro (Notion API, comment spam). Quando precisar precisão cross-region,
// trocar pra @upstash/ratelimit + Vercel KV.
//
// Uso (em route handler):
//   const limited = checkRateLimit(`comment:${ip}`, { max: 5, windowMs: 60_000 })
//   if (limited) return NextResponse.json({ error: "rate_limited" }, { status: 429 })

type Bucket = {
  // Timestamps de requests dentro da janela. Cleaned no check.
  hits: number[]
}

const buckets = new Map<string, Bucket>()

// Cleanup automático: a cada N checks, varre buckets velhos pra não
// acumular memória ilimitada.
let checkCount = 0
const CLEANUP_EVERY = 1000
const MAX_BUCKETS = 10_000

export type RateLimitOptions = {
  // Max requests permitidos dentro de windowMs.
  max: number
  // Janela em ms.
  windowMs: number
}

// Retorna true se o request DEVE ser bloqueado (rate limit excedido).
// Atualiza contador como side-effect.
export function checkRateLimit(key: string, options: RateLimitOptions): boolean {
  const now = Date.now()
  const cutoff = now - options.windowMs

  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { hits: [] }
    buckets.set(key, bucket)
  }

  // Drop entries fora da janela
  bucket.hits = bucket.hits.filter((t) => t > cutoff)

  if (bucket.hits.length >= options.max) {
    return true
  }
  bucket.hits.push(now)

  // Periodic cleanup pra não vazar memória
  checkCount++
  if (checkCount >= CLEANUP_EVERY) {
    checkCount = 0
    cleanup(cutoff)
  }
  if (buckets.size > MAX_BUCKETS) {
    cleanup(cutoff)
  }

  return false
}

function cleanup(cutoff: number) {
  for (const [k, b] of buckets) {
    b.hits = b.hits.filter((t) => t > cutoff)
    if (b.hits.length === 0) buckets.delete(k)
  }
}

// Helper pra extrair o IP do request. Prefere x-real-ip (Vercel proxy,
// não-spoofável) over x-forwarded-for (cliente pode prepend valores).
export function clientIp(req: Request): string {
  return req.headers.get("x-real-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown"
}
