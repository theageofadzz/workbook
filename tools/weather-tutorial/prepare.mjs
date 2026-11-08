import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";

const source = process.argv[2];
if (!source) throw new Error("Pass the workbook root.");
const sharp = createRequire(join(resolve(source), "package.json"))("sharp");
const root = resolve(import.meta.dirname);
const assets = join(root, "assets");
await mkdir(assets, { recursive: true });
const html = await readFile(join(source, "docs/shirota-weather.html"), "utf8");
const data = JSON.parse(html.match(/window\.__weatherMotion=(\{.*?\});/s)[1]);
for (const [name, layer] of Object.entries(data.layers)) {
  for (const [index, atlas] of layer.atlases.entries()) {
    const path = `assets/${name}-${index}.webp`;
    await writeFile(join(root, path), Buffer.from(atlas.src.split(",")[1], "base64"));
    atlas.src = path;
  }
}
await writeFile(join(root, "motion-data.js"), `window.weatherData=${JSON.stringify(data)};\n`);
await copyFile(join(source, "src/assets/cicada-cursor.svg"), join(assets, "cursor.svg"));
await copyFile(join(source, "src/assets/works/weather.webp"), join(assets, "final.webp"));
if (process.argv[3]) {
  await sharp(process.argv[3]).extract({ left: 21, top: 12, width: 516, height: 518 })
    .resize(518, 518).webp({ quality: 95 }).toFile(join(assets, "reference.webp"));
} else {
  await copyFile(join(root, "reference.webp"), join(assets, "reference.webp"));
}
await copyFile(join(root, "vendor/gsap.min.js"), join(assets, "gsap.min.js"));
console.log("Prepared seven real atlases, original artwork, final artwork, and cursor.");
