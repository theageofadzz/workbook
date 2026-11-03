import sharp from "sharp";
import { readFile, writeFile, stat, access } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cache = join(root, ".cache", "reference");
const manifestFile = join(cache, "manifest.json");
const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
const gifs = manifest.files.filter(file => file.local.endsWith(".gif") && !file.originalLocal);
let saved = 0;
let completed = 0;
sharp.concurrency(2);

async function optimize(file) {
  const original = join(cache, file.local);
  const local = file.local.replace(/\.gif$/, ".webp");
  const target = join(cache, local);
  try {
    try { await access(target); } catch {
      await sharp(original, { animated: true, limitInputPixels: false })
        .webp({ quality: 88, effort: 2 })
        .toFile(target);
    }
    const before = await sharp(original, { animated: true, limitInputPixels: false }).metadata();
    const after = await sharp(target, { animated: true, limitInputPixels: false }).metadata();
    const duration = metadata => (metadata.delay || []).reduce((sum, value) => sum + value, 0);
    if (before.width !== after.width ||
        (before.pageHeight || before.height) !== (after.pageHeight || after.height) ||
        duration(before) !== duration(after)) throw new Error("Animation dimensions or timing changed");
    const bytes = (await stat(target)).size;
    if (bytes < file.bytes) {
      const originalBytes = file.bytes;
      file.originalLocal = file.local;
      file.local = local;
      file.originalBytes = originalBytes;
      file.bytes = bytes;
      file.animationFrames = after.pages || 1;
      file.animationDuration = duration(after);
      saved += originalBytes - bytes;
    }
  } catch (error) {
    console.warn(`Keeping original animation ${file.local}: ${error.message}`);
  }
  completed++;
  console.log(`Optimized ${completed}/${gifs.length}; saved ${Math.round(saved / 1024 / 1024)} MiB`);
}

let cursor = 0;
async function worker() {
  while (cursor < gifs.length) await optimize(gifs[cursor++]);
}
await Promise.all([worker(), worker()]);
await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
console.log(`Animation optimization complete; saved ${Math.round(saved / 1024 / 1024)} MiB.`);
