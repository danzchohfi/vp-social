import crypto from "crypto"

function hmac(value: string): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? ""
  return crypto.createHmac("sha256", secret).update(value).digest("hex").slice(0, 32)
}

export function signProxyUrl(videoUrl: string): string {
  const sig = hmac(videoUrl)
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ""
  return `${base}/api/tiktok-proxy?url=${encodeURIComponent(videoUrl)}&sig=${sig}`
}

export function verifyProxySig(videoUrl: string, sig: string): boolean {
  return hmac(videoUrl) === sig
}
