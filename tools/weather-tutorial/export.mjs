import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const master = resolve(process.argv[2] || "weather-tutorial-master.mp4");
const workbook = resolve(process.argv[3] || "../..");
const sharp = createRequire(join(workbook, "package.json"))("sharp");
const out = join(workbook, "src/assets/articles");
const names = ["align", "layers", "type", "gif", "preview", "check"];
const posterTimes = [7.5, 12, 12, 8, 6, 3];
await mkdir(out, { recursive: true });

function frame(file, time) {
  return execFileSync("ffmpeg", [
    "-v", "error", "-ss", String(time), "-i", file,
    "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-",
  ], { maxBuffer: 12 * 1024 * 1024 });
}
for (const [index, name] of names.entries()) {
  const output = join(out, `weather-${name}.mp4`);
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-ss", String(index * 16), "-i", master,
    "-t", "16", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "20",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", output,
  ]);
  const metadata = JSON.parse(execFileSync("ffprobe", [
    "-v", "error", "-show_streams", "-show_format", "-of", "json", output,
  ], { encoding: "utf8" }));
  const stream = metadata.streams.find(item => item.codec_type === "video");
  assert.equal(stream.width, 1120);
  assert.equal(stream.height, 840);
  assert.equal(stream.r_frame_rate, "24/1");
  assert(Math.abs(Number(metadata.format.duration) - 16) < 0.05);
  const hashes = [];
  for (const time of [0, 8]) {
    const sample = frame(output, time);
    const stats = await sharp(sample).stats();
    assert(stats.channels.slice(0, 3).every(channel => channel.mean > 40), `Blank ${name} frame at ${time}`);
    hashes.push(createHash("sha256").update(await sharp(sample).resize(140, 105).raw().toBuffer()).digest("hex"));
  }
  assert.notEqual(hashes[0], hashes[1], `${name} must visibly change`);
  await writeFile(join(out, `weather-${name}.webp`),
    await sharp(frame(output, posterTimes[index])).webp({ quality: 90 }).toBuffer());
  console.log(`${name}: 16s, 1120x840, 24fps, nonblank first frame and changing pixels`);
}
