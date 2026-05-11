/**
 * Video splitter for Instagram Story chunks.
 *
 * Instagram Stories cap at 60s per video (error code 2207082). When a user
 * schedules a longer video as a Story, we probe its duration with ffprobe,
 * slice it into 60s segments with ffmpeg (`-c copy`, no re-encode for speed),
 * and hand the local file paths back to the caller. The caller uploads each
 * chunk directly to Instagram via the resumable-upload API — no public
 * intermediate URL is needed.
 *
 * History: this used to upload chunks to Vercel Blob and pass URLs to IG's
 * `video_url`-style endpoint. That required the Blob store to be configured
 * as public; Vercel doesn't let you change the access level of an existing
 * store and the user got stuck on the recreate step. Switching to IG's
 * resumable upload removes the storage layer entirely — chunks live in a
 * tmpdir for the duration of the publish and get cleaned up after.
 *
 * Runtime requirement: `ffmpeg` and `ffprobe` available on PATH. In the
 * Trigger.dev worker container this is provided by the official `ffmpeg()`
 * build extension (see trigger.config.ts).
 *
 * Vercel-function-safety: this module is ONLY imported from `trigger/` code,
 * never from Next.js routes. /api/posts/publish-now uses lib/mp4-duration.ts
 * (pure JS) for a duration probe to refuse long Stories with a clean error.
 */

import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

const exec = promisify(execFile)

const STORY_MAX_SECONDS = 60

export type StoryChunk = {
  /** Absolute path to the local mp4 file. Caller is responsible for reading. */
  localPath: string
  /** 1-indexed position in the sequence. */
  index: number
  /** Total number of chunks. */
  total: number
  /** Duration of this chunk in seconds (last chunk is usually shorter). */
  durationSec: number
}

export type SplitResult = {
  chunks: StoryChunk[]
  /** Removes the tmpdir + all chunk files. Safe to call multiple times. */
  cleanup: () => Promise<void>
  /** Read a chunk's bytes; used by callers that prefer buffer-style. */
  readChunk: (chunk: StoryChunk) => Promise<Buffer>
}

/**
 * Probe the duration of a remote video URL via ffprobe. Streams the file's
 * headers without downloading the full payload, so this is cheap (< 1s for
 * typical podcast clips).
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
 * Slice a long video into ≤60s chunks on local disk.
 *
 * Caller should call probeVideoDurationSec first and only invoke this when
 * duration > 60s — otherwise the result is a single chunk = the original
 * video, which is wasted work.
 *
 * Slicing uses `-c copy` (stream copy, no re-encode) for speed. Cuts land at
 * the nearest preceding keyframe, so chunks may have a slight overlap or
 * gap of a few frames. Acceptable for Story content (60s talking-head
 * format). Re-encoding would be precise but takes 5–10x longer.
 *
 * The returned `cleanup` MUST be called in a finally block — otherwise
 * the tmpdir leaks. `readChunk` is a convenience that returns the file
 * bytes for callers that want to hand off to an upload API.
 */
export async function splitStoryVideo(videoUrl: string): Promise<SplitResult> {
  const totalDuration = await probeVideoDurationSec(videoUrl)
  const numChunks = Math.ceil(totalDuration / STORY_MAX_SECONDS)
  if (numChunks <= 1) {
    throw new Error(`splitStoryVideo called on ${totalDuration}s video — caller should not split <= 60s`)
  }

  const tmpDir = await mkdtemp(join(tmpdir(), "vp-story-"))

  const chunks: StoryChunk[] = []
  for (let i = 0; i < numChunks; i++) {
    const startSec = i * STORY_MAX_SECONDS
    const remaining = totalDuration - startSec
    const chunkDuration = Math.min(STORY_MAX_SECONDS, remaining)
    const localPath = join(tmpDir, `chunk-${i + 1}.mp4`)

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

    chunks.push({
      localPath,
      index: i + 1,
      total: numChunks,
      durationSec: chunkDuration,
    })
  }

  return {
    chunks,
    cleanup: async () => {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    },
    readChunk: (c) => readFile(c.localPath),
  }
}
