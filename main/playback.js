const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

function playbackSafePath(filePath) {
  return filePath.replace(/\.[^.]+$/, ".mp4");
}

/** Convert WebM/VP8A to MP4 so Linux file managers avoid GStreamer's VP8 alpha path. */
async function makePlaybackSafe(filePath) {
  const outputPath = playbackSafePath(filePath);
  const tmp = outputPath.replace(/\.mp4$/i, ".tmp.mp4");

  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      filePath,
      "-map",
      "0:v:0?",
      "-map",
      "0:a:0?",
      "-c:v",
      "libopenh264",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "main",
      "-b:v",
      "8M",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      tmp,
    ],
    { timeout: 300000 }
  );

  fs.renameSync(tmp, outputPath);
  if (outputPath !== filePath) fs.unlinkSync(filePath);
  return outputPath;
}

async function hasFfmpeg() {
  try {
    await execFileAsync("ffmpeg", ["-version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

module.exports = { makePlaybackSafe, hasFfmpeg, playbackSafePath };
