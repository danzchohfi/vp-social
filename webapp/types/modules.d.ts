// Ambient declarations for npm packages that ship without types.
//
// `ffprobe-static` exports `{ path: string }` as its default export — used
// by lib/video-splitter.ts to locate the ffprobe binary at runtime. Without
// this declaration, `next build` fails under TS strict mode with
// "Could not find a declaration file for module 'ffprobe-static'".

declare module "ffprobe-static" {
  const ffprobe: { path: string }
  export default ffprobe
}
