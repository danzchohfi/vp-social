// Generates app-icon variants from the source PNG at repo-root /logo.png.
// Runs at prebuild time (see package.json) so Vercel produces fresh sized
// PNGs into webapp/public/ on every deploy. Source-of-truth = /logo.png.
//
// Outputs (all in webapp/public/):
//   icon.png         512x512  (PWA, source mirror)
//   icon-1024.png    1024x1024 (TikTok dev-portal submission, App Store style)
//   icon-512.png     512x512  (PWA standard)
//   icon-192.png     192x192  (PWA small)
//   apple-icon.png   180x180  (iOS home screen)
//   favicon-32.png   32x32    (browser tab)
//
// Usage: npm run generate:icons

import sharp from "sharp"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const webapp = resolve(__dirname, "..")
const repoRoot = resolve(webapp, "..")

const candidates = [
  resolve(repoRoot, "logo.png"),
  resolve(webapp, "public/icon.png"),
]
const sourcePath = candidates.find((p) => existsSync(p))
if (!sourcePath) {
  console.error(`generate-icons: no source PNG found. Tried:\n  ${candidates.join("\n  ")}`)
  process.exit(1)
}
console.log(`generate-icons: using source ${sourcePath}`)
const source = readFileSync(sourcePath)

const targets = [
  { name: "icon.png", size: 512 },
  { name: "icon-1024.png", size: 1024 },
  { name: "icon-512.png", size: 512 },
  { name: "icon-192.png", size: 192 },
  { name: "apple-icon.png", size: 180 },
  { name: "favicon-32.png", size: 32 },
]

for (const { name, size } of targets) {
  const buf = await sharp(source)
    .resize(size, size, { kernel: "lanczos3", fit: "cover" })
    .png({ compressionLevel: 9 })
    .toBuffer()
  writeFileSync(resolve(webapp, "public", name), buf)
  console.log(`  wrote public/${name} (${size}x${size}, ${buf.length} bytes)`)
}
