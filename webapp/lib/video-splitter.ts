/**
 * Video splitter for Instagram Story chunks.
 *
 * Instagram Stories cap at 60s per video (error code 2207082). When a user
 * schedules a longer video as a Story, we probe its duration with ffprobe,
 * slice it into 60s segments with ffmpeg (`-c copy`, no re-encode for speed),
 * upload each chunk to Vercel Blob, and return public URLs the cron can feed
 * one at a time to Instagram's `publishStoryVideo`.
 *
 * Runtime requirement: `ffmpeg` and `ffprobe` available on PATH. In the
 * Trigger.dev worker container this is provided by the official `ffmpeg()`
 * build extension (see trigger.config.ts) which apt-installs them. We
 * tried `ffmpeg-static`/`ffprobe-static` first; their npm postinstall
 * doesn't run reliably during Trigger.dev's deploy build so the binaries
 * weren't available at runtime — `ffprobeStatic.path` was undefined,
 * probeVideoDurationSec threw, duration stayed 0, and the long-Story
 * branch was skipped, falling through to direct publish and IG 2207082.
 *
 * Vercel-function-safety: this module is **only imported from trigger/**
 * code, never from Next.js routes — Vercel functions don't have ffmpeg
 * on PATH. /api/posts/publish-now uses lib/mp4-duration.ts (pure JS) for
 * a duration probe before refusing long Stories with a clean error.
 *
 * Vercel Blob is the storage layer. The Trigger.dev worker needs
 * BLOB_READ_WRITE_TOKEN in its env vars (Vercel auto-injects it on the
 * Vercel side, but the worker is a separate environment).
 */

import { put } from "@vercel/blob"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { generateId } from "./utils"

const exec = promisify(execFile)

const STORY_MAX_SECONDS = 60

export type StoryChunk = {
  /** Public URL the IG container can fetch. */
  url: string
  /** 1-indexed position in the sequence. */
  index: number
  /** Total number of chunks. */
  total: number
  /** Duration of this chunk in seconds (last chunk is usually shorter). */
  durationSec: number
}

/**
 * Probe the duration of a remote video URL via ffprobe. ffprobe streams the
 * file's headers without downloading the full payload, so this is cheap
 * (< 1s for typical podcast clips).
 *
 * Returns duration in seconds. Throws if ffprobe can't parse the response
 * (corrupt file, URL inaccessible, unsupported container).
 */
export async function probeVideoDurationSec(videoUrl: string): Promise<number> {
  const { stdout } = await exec(
    "ffprobe",
    [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      videoUrl,
    ],
    { maxBuffer: 1024 * 1024 },
  )
  const seconds = parseFloat(stdout.trim())
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`ffprobe returned non-numeric duration for ${videoUrl}: "${stdout.trim()}"`)
  }
  return seconds
}

/**
 * Slice a long video into ≤60s chunks and upload each to Vercel Blob.
 *
 * Caller should call probeVideoDurationSec first and only invoke this when
 * duration > 60s — otherwise the result is a single chunk = the original
 * video, which is wasted work.
 *
 * Slicing uses `-c copy` (stream copy, no re-encode) for speed. Cuts land at
 * the nearest preceding keyframe, so chunks may have a slight overlap or
 * gap of a few frames. Acceptable for Story content (60s, talking-head
 * format). Re-encoding would be precise but takes 5-10x longer and burns
 * trigger task time.
 *
 * Throws on any sub-step failure (ffmpeg, blob upload, fs ops). Cleanup of
 * the local temp dir happens in the finally block; uploaded blobs persist
 * (they're cheap and Vercel's Blob lifecycle should be configured to
 * auto-delete after 7 days at the bucket level).
 */
export async function splitStoryVideo(videoUrl: string): Promise<StoryChunk[]> {
  const totalDuration = await probeVideoDurationSec(videoUrl)
  const numChunks = Math.ceil(totalDuration / STORY_MAX_SECONDS)
  if (numChunks <= 1) {
    throw new Error(`splitStoryVideo called on ${totalDuration}s video — caller should not split <= 60s`)
  }

  const tmpDir = await mkdtemp(join(tmpdir(), "vp-story-"))
  const blobPrefix = `story-chunks/${generateId()}`

  try {
    const chunks: StoryChunk[] = []
    for (let i = 0; i < numChunks; i++) {
      const startSec = i * STORY_MAX_SECONDS
      const remaining = totalDuration - startSec
      const chunkDuration = Math.min(STORY_MAX_SECONDS, remaining)
      const localPath = join(tmpDir, `chunk-${i}.mp4`)

      // -ss BEFORE -i: fast input seeking. Combined with -c copy this lands
      // on the nearest keyframe before startSec; precise to within a GOP
      // (typically 2s for IG-friendly content).
      await exec(
        "ffmpeg",
        [
          "-ss", String(startSec),
          "-t", String(STORY_MAX_SECONDS),
          "-i", videoUrl,
          "-c", "copy",
          "-avoid_negative_ts", "make_zero",
          "-y",
          localPath,
        ],
        { maxBuffer: 16 * 1024 * 1024 },
      )

      const buf = await readFile(localPath)
      const blob = await put(`${blobPrefix}/chunk-${i + 1}.mp4`, buf, {
        access: "public",
        contentType: "video/mp4",
      })

      chunks.push({
        url: blob.url,
        index: i + 1,
        total: numChunks,
        durationSec: chunkDuration,
      })
    }
    return chunks
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
