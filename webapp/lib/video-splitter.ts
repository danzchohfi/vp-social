/**
 * Video splitter for Instagram Story chunks.
 *
 * Instagram Stories cap at 60s per video (error code 2207082). When a user
 * schedules a longer video as a Story, we probe its duration with ffprobe,
 * slice it into 60s segments with ffmpeg (`-c copy`, no re-encode for speed),
 * upload each chunk to Vercel Blob, and return public URLs the cron can feed
 * one at a time to Instagram's `publishStoryVideo`.
 *
 * Why ffmpeg-static (vs Mux/Cloudflare Stream): keeps the ops surface small
 * and matches the existing self-contained worker model. The binary is ~75MB
 * which fits in Trigger.dev v3's container build but would blow Vercel's
 * 50MB Hobby function limit — so this module is **only imported from
 * trigger/** code, never from Next.js routes. /publish-now refuses long
 * Story videos and points users at scheduled publish.
 *
 * Vercel Blob is the storage layer. It auto-injects BLOB_READ_WRITE_TOKEN
 * when the project has a Blob store connected (Storage tab in the Vercel
 * dashboard). Public access is required so Instagram's CDN can fetch the
 * chunk during media-container creation.
 */

import { put } from "@vercel/blob"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import ffmpegStatic from "ffmpeg-static"
import ffprobeStatic from "ffprobe-static"
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
  if (!ffprobeStatic.path) throw new Error("ffprobe-static binary missing — check install")
  const { stdout } = await exec(
    ffprobeStatic.path,
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
  if (!ffmpegStatic) throw new Error("ffmpeg-static binary missing — check install")

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
        ffmpegStatic,
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
