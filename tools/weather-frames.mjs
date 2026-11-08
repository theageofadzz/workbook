import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

export async function writeWeatherFrames({ root, out }) {
  const samples = [0, 8, 16, 24, 32, 40];
  const tile = 320;
  const gap = 12;
  const frames = await Promise.all(samples.map(async (page, index) => ({
    input: await sharp(join(root, "src", "assets", "works", "weather.gif"), { page, pages: 1 })
      .resize(tile, tile)
      .webp({ quality: 92 })
      .toBuffer(),
    left: index % 3 * (tile + gap),
    top: Math.floor(index / 3) * (tile + gap)
  })));
  const directory = join(out, "assets", "articles");
  await mkdir(directory, { recursive: true });
  await sharp({
    create: { width: tile * 3 + gap * 2, height: tile * 2 + gap, channels: 3, background: "#f3f3f3" }
  }).composite(frames).webp({ quality: 92 }).toFile(join(directory, "weather-frames.webp"));
}
