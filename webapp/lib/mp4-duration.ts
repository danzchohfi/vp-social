/**
 * Pure-JS MP4 duration probe — Vercel-function-safe.
 *
 * The full ffmpeg/ffprobe pipeline lives in lib/video-splitter.ts and is
 * Trigger.dev-only because the static binaries blow Vercel's 50MB function
 * limit. But we need a way for /api/posts/publish-now (a Vercel route) to
 * detect "this Story video is > 60s" BEFORE calling Instagram so the user
 * sees a clean error instead of IG's cryptic 2207082.
 *
 * Approach: HTTP Range request for the first ~1MB of the file, then walk
 * MP4 box headers to find moov → mvhd, parse duration + timescale.
 *
 * Works for "fast-start" MP4s where moov is at the front of the file (which
 * IG-bound videos must be anyway — IG's own ingestion requires it). For
 * non-fast-start sources the parser returns null and the caller should
 * fall through to the regular publish attempt.
 *
 * Box format (ISO/IEC 14496-12):
 *   uint32 size
 *   char[4] type
 *   ... payload (size - 8 bytes; or size - 16 if first 4 bytes are 0x01)
 *
 * mvhd payload:
 *   uint8 version (0 or 1)
 *   uint8[3] flags
 *   if version == 0:
 *     uint32 creation_time, modification_time, timescale, duration
 *   else (1):
 *     uint64 creation_time, modification_time
 *     uint32 timescale
 *     uint64 duration
 */

const PROBE_BYTES = 1_048_576 // 1MB — enough for moov in fast-start MP4s.

/**
 * Probe a remote video URL for duration in seconds. Returns null when:
 *   - the URL responds non-2xx
 *   - the file isn't a parseable MP4 (other containers, malformed headers)
 *   - moov isn't in the first 1MB (non-fast-start MP4)
 *
 * Caller should treat null as "unknown" and either skip the duration check
 * or fall through to the original API call.
 */
export async function probeMp4DurationSec(videoUrl: string): Promise<number | null> {
  let res: Response
  try {
    res = await fetch(videoUrl, {
      headers: { Range: `bytes=0-${PROBE_BYTES - 1}` },
    })
  } catch {
    return null
  }
  if (!res.ok && res.status !== 206) return null
  const ab = await res.arrayBuffer()
  const view = new DataView(ab)
  return findMvhdDuration(view)
}

/** Walk top-level MP4 boxes, find moov, descend into it for mvhd. */
function findMvhdDuration(view: DataView): number | null {
  let offset = 0
  while (offset + 8 <= view.byteLength) {
    const { size, type, headerSize } = readBoxHeader(view, offset)
    if (size <= 0 || size > view.byteLength * 4) return null // sanity
    if (type === "moov") {
      // moov payload starts at offset + headerSize. mvhd is the first child
      // box inside moov by spec. Walk children until we find it.
      const moovEnd = Math.min(offset + size, view.byteLength)
      let inner = offset + headerSize
      while (inner + 8 <= moovEnd) {
        const child = readBoxHeader(view, inner)
        if (child.size <= 0 || inner + child.size > moovEnd) break
        if (child.type === "mvhd") {
          return parseMvhd(view, inner + child.headerSize, child.size - child.headerSize)
        }
        inner += child.size
      }
      return null
    }
    offset += size
  }
  return null
}

function readBoxHeader(view: DataView, offset: number): { size: number; type: string; headerSize: number } {
  const size32 = view.getUint32(offset)
  const type = String.fromCharCode(
    view.getUint8(offset + 4),
    view.getUint8(offset + 5),
    view.getUint8(offset + 6),
    view.getUint8(offset + 7),
  )
  if (size32 === 1) {
    // 64-bit extended size — read low 32 bits only (anything bigger than
    // 4GB is way past our probe window anyway).
    if (offset + 16 > view.byteLength) return { size: 0, type, headerSize: 16 }
    const lo = view.getUint32(offset + 12)
    return { size: lo, type, headerSize: 16 }
  }
  return { size: size32, type, headerSize: 8 }
}

function parseMvhd(view: DataView, payloadStart: number, payloadLen: number): number | null {
  if (payloadLen < 4) return null
  const version = view.getUint8(payloadStart)
  let timescale: number
  let duration: number
  if (version === 0) {
    if (payloadLen < 4 + 4 + 4 + 4 + 4) return null
    timescale = view.getUint32(payloadStart + 4 + 4 + 4)
    duration = view.getUint32(payloadStart + 4 + 4 + 4 + 4)
  } else if (version === 1) {
    if (payloadLen < 4 + 8 + 8 + 4 + 8) return null
    timescale = view.getUint32(payloadStart + 4 + 8 + 8)
    // 64-bit duration — read low 32 bits; > 13 hours @ 90kHz timescale is
    // not relevant for IG content.
    duration = view.getUint32(payloadStart + 4 + 8 + 8 + 4 + 4)
  } else {
    return null
  }
  if (!timescale || !duration) return null
  return duration / timescale
}
